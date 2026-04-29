import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';

export type CampaignType = 'mail' | 'social' | 'whatsapp';
export type CampaignStatus =
  | 'concept'
  | 'ingepland'
  | 'actief'
  | 'afgerond'
  | 'gearchiveerd';

export type CampaignResultStats = {
  extra_reservations?: number;
  extra_revenue_cents?: number;
  retention_guests?: number;
  impressions?: number;
  likes?: number;
};

export type Campaign = {
  id: string;
  name: string;
  type: CampaignType;
  meta: string | null;
  status: CampaignStatus;
  result_stats: CampaignResultStats | null;
};

export type CampaignDetail = Campaign & {
  subject_line: string | null;
  body: string | null;
  preview_data: Record<string, unknown> | null;
  scheduled_for: string | null;
  executed_at: string | null;
  tags: string[] | null;
  created_at: string;
  content: Record<string, unknown> | null;
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ai: AiService,
  ) {}

  async findAll(restaurantId: string): Promise<Campaign[]> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id, name, type, meta, status, result_stats')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Campaign[];
  }

  async findById(restaurantId: string, id: string): Promise<CampaignDetail> {
    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .single();

    if (campErr) throw new InternalServerErrorException(campErr.message);

    const table =
      campaign.type === 'mail'
        ? 'campaign_mail_content'
        : campaign.type === 'social'
          ? 'campaign_social_content'
          : 'campaign_whatsapp_content';

    const { data: content } = await this.supabase.client
      .from(table)
      .select('*')
      .eq('campaign_id', id)
      .maybeSingle();

    return { ...campaign, content } as CampaignDetail;
  }

  // Maakt een nieuwe campagne aan als 'concept'. Wordt o.a. gebruikt
  // door de chat-actie "maak een campagne aan uit Filly's voorstel".
  // Schrijft altijd naar twee tabellen: campaigns (hoofdrij) +
  // campaign_<type>_content (type-specifieke velden).
  //
  // Als de content-insert faalt, rollen we de campaigns-rij terug
  // zodat we geen half-leeg record achterlaten dat overal als broken
  // verschijnt in het overzicht.
  async create(
    restaurantId: string,
    input: {
      name: string;
      type: CampaignType;
      subject_line?: string | null;
      body: string;
    },
  ): Promise<{ id: string }> {
    const name = input.name.trim();
    const body = input.body.trim();
    if (!name) {
      throw new InternalServerErrorException('Campagne-naam is verplicht.');
    }
    if (!body) {
      throw new InternalServerErrorException(
        'Campagne-inhoud is verplicht.',
      );
    }

    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .insert({
        restaurant_id: restaurantId,
        name,
        type: input.type,
        status: 'concept',
        // meta is een kort display-label. Bij chat-voorstellen zetten
        // we een herkenbare bron-markering zodat je in het overzicht
        // ziet dat Filly 'm heeft aangedragen. Kan later een nette
        // badge worden i.p.v. tekst.
        meta: 'Voorgesteld door Filly',
      })
      .select('id')
      .single();

    if (campErr) throw new InternalServerErrorException(campErr.message);

    const campaignId = campaign.id as string;

    let contentErr: { message: string } | null = null;
    if (input.type === 'mail') {
      // Mail-tabel eist subject_line NOT NULL. Als Filly 'm niet gaf
      // (wat niet zou moeten bij type=mail), vallen we terug op de
      // campagne-naam — beter een zinvol onderwerp dan een DB-fout.
      const { error } = await this.supabase.client
        .from('campaign_mail_content')
        .insert({
          campaign_id: campaignId,
          subject_line: input.subject_line?.trim() || name,
          body_plain: body,
        });
      contentErr = error;
    } else if (input.type === 'social') {
      const { error } = await this.supabase.client
        .from('campaign_social_content')
        .insert({
          campaign_id: campaignId,
          caption: body,
        });
      contentErr = error;
    } else {
      const { error } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .insert({
          campaign_id: campaignId,
          message_text: body,
        });
      contentErr = error;
    }

    if (contentErr) {
      // Rollback: de campagne-rij weggooien zodat we geen lege kaart
      // in het overzicht krijgen. Foutmelding bevat DB-message zodat
      // de frontend kan tonen wat er mis ging.
      await this.supabase.client
        .from('campaigns')
        .delete()
        .eq('id', campaignId);
      throw new InternalServerErrorException(contentErr.message);
    }

    return { id: campaignId };
  }

  // Bijwerken van een concept-campagne. Alleen toegestaan zolang
  // status='concept' — daarna is de campagne immutable zodat we
  // voor audit/verzendlogica geen silent wijzigingen krijgen
  // (een reeds verstuurde mail mag z'n body niet stiekem zien
  // veranderen). Naast name + subject_line + body updaten we óók
  // de content-tabel, gescheiden per type.
  async update(
    restaurantId: string,
    id: string,
    input: {
      name?: string;
      subject_line?: string | null;
      body?: string;
    },
  ): Promise<{ id: string }> {
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (existing.status !== 'concept') {
      throw new BadRequestException(
        `Alleen concept-campagnes zijn te bewerken (deze is ${existing.status}).`,
      );
    }

    // Hoofdrij: alleen name updaten als 'm meegegeven is, anders
    // ongewijzigd. Net zo voor content-veld. updated_at zetten we
    // handmatig ook omdat Supabase's default-now-trigger niet op
    // elke tabel zit.
    if (typeof input.name === 'string') {
      const nameTrimmed = input.name.trim();
      if (!nameTrimmed) {
        throw new BadRequestException('Campagne-naam mag niet leeg zijn.');
      }
      const { error: updErr } = await this.supabase.client
        .from('campaigns')
        .update({ name: nameTrimmed, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('restaurant_id', restaurantId);
      if (updErr) throw new InternalServerErrorException(updErr.message);
    }

    const body =
      typeof input.body === 'string' ? input.body.trim() : undefined;
    const subjectLine =
      input.subject_line === null
        ? null
        : typeof input.subject_line === 'string'
          ? input.subject_line.trim()
          : undefined;

    // Type-specifieke content-tabel bijwerken. Alleen velden waarmee
    // de user werkt vanuit de dashboard-edit (subject, body).
    if (body !== undefined || subjectLine !== undefined) {
      const type = existing.type as 'mail' | 'social' | 'whatsapp';
      if (type === 'mail') {
        const patch: Record<string, unknown> = {};
        if (subjectLine !== undefined) patch.subject_line = subjectLine ?? '';
        if (body !== undefined) patch.body_plain = body;
        patch.updated_at = new Date().toISOString();
        const { error: contErr } = await this.supabase.client
          .from('campaign_mail_content')
          .update(patch)
          .eq('campaign_id', id);
        if (contErr) throw new InternalServerErrorException(contErr.message);
      } else if (type === 'social') {
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (body !== undefined) patch.caption = body;
        const { error: contErr } = await this.supabase.client
          .from('campaign_social_content')
          .update(patch)
          .eq('campaign_id', id);
        if (contErr) throw new InternalServerErrorException(contErr.message);
      } else {
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (body !== undefined) patch.message_text = body;
        const { error: contErr } = await this.supabase.client
          .from('campaign_whatsapp_content')
          .update(patch)
          .eq('campaign_id', id);
        if (contErr) throw new InternalServerErrorException(contErr.message);
      }
    }

    return { id };
  }

  // Status-transitie. Niet elke transitie is geldig — we modelleren
  // de verzendlevenscyclus expliciet zodat een afgeronde campagne
  // niet stilletjes "concept" wordt of een actieve verzending niet
  // overgeslagen wordt. Bewust enkel deze mappings:
  //   concept → ingepland | gearchiveerd
  //   ingepland → actief | concept | gearchiveerd
  //   actief → afgerond
  //   afgerond / gearchiveerd → eindstaat (geen transitions)
  async updateStatus(
    restaurantId: string,
    id: string,
    nextStatus: CampaignStatus,
  ): Promise<{ id: string; status: CampaignStatus }> {
    const allowed: Record<CampaignStatus, CampaignStatus[]> = {
      concept: ['ingepland', 'gearchiveerd'],
      ingepland: ['actief', 'concept', 'gearchiveerd'],
      actief: ['afgerond'],
      afgerond: [],
      gearchiveerd: [],
    };

    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }

    const currentStatus = existing.status as CampaignStatus;
    if (!allowed[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Status-transitie van '${currentStatus}' naar '${nextStatus}' is niet toegestaan.`,
      );
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    // Bij activeren leggen we de start-tijd vast voor verzend-tracking.
    if (nextStatus === 'actief') {
      updates.executed_at = new Date().toISOString();
    }

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return { id, status: nextStatus };
  }

  // Genereert 3 alternatieve versies van een concept-campagne. Pure
  // generator (geen DB-write) — frontend toont de varianten en de
  // eigenaar kiest welke 'm via PATCH wil opslaan. Alleen op concept-
  // status; ingeplande/actieve campagnes zijn immutable.
  //
  // De optionele instructie ("maak korter", "speelser") stuurt de
  // alternatieven die richting op. Zonder instructie krijg je 3
  // gevarieerde herschrijvingen (warm/zakelijk/speels).
  async refine(
    restaurantId: string,
    id: string,
    instruction?: string,
  ): Promise<{
    variants: Array<{ subject_line?: string; body: string }>;
  }> {
    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, name')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (campaign.status !== 'concept') {
      throw new BadRequestException(
        `Alternatieven genereren kan alleen bij concept-campagnes (deze is ${campaign.status}).`,
      );
    }

    const type = campaign.type as 'mail' | 'social' | 'whatsapp';
    const contentTable =
      type === 'mail'
        ? 'campaign_mail_content'
        : type === 'social'
          ? 'campaign_social_content'
          : 'campaign_whatsapp_content';

    const { data: content, error: contentErr } = await this.supabase.client
      .from(contentTable)
      .select('*')
      .eq('campaign_id', id)
      .maybeSingle();

    if (contentErr) throw new InternalServerErrorException(contentErr.message);

    // Pak de huidige body + (bij mail) onderwerp uit de juiste kolom.
    const currentBody =
      type === 'mail'
        ? (content?.body_plain as string) ?? ''
        : type === 'social'
          ? (content?.caption as string) ?? ''
          : (content?.message_text as string) ?? '';
    const currentSubject =
      type === 'mail' ? ((content?.subject_line as string) ?? '') : '';

    const trimmedInstruction =
      typeof instruction === 'string' ? instruction.trim() : '';
    if (trimmedInstruction.length > 1000) {
      throw new BadRequestException(
        'Instructie mag maximaal 1000 tekens zijn.',
      );
    }

    // System-prompt: Filly krijgt de huidige campagne + (optionele)
    // instructie en moet 3 verschillende alternatieven leveren in
    // exact deze JSON-vorm. Net als bij chat-proposals stellen we
    // varianten écht-verschillend qua toon: warm / zakelijk / speels.
    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor de horeca. Je krijgt een bestaande campagne en moet 3 alternatieve versies bedenken.

Geef ALTIJD exact dit JSON-formaat terug, zonder markdown-codeblok, zonder uitleg eromheen:

{
  "variants": [
    { "subject_line": "<onderwerp v1>", "body": "<tekst v1>" },
    { "subject_line": "<onderwerp v2>", "body": "<tekst v2>" },
    { "subject_line": "<onderwerp v3>", "body": "<tekst v3>" }
  ]
}

Regels:
- EXACT 3 varianten. Maak ze écht verschillend in toon/insteek/lengte
  (bv. v1 = warm-uitnodigend, v2 = zakelijk-direct, v3 = speels-kort).
  Niet alleen wat woorden anders.
- Behoud de kern van de boodschap (datum, aanbod, USP) tenzij de
  instructie expliciet vraagt om iets te wijzigen.
- "subject_line" alleen voor mail-campagnes; voor social/whatsapp mag
  je 'm leeg laten of weglaten.
- "body" bevat de volledige uitgeschreven tekst.
- Schrijf in het Nederlands.
- Verzin geen feiten/cijfers die niet in de oorspronkelijke versie
  stonden.`;

    const currentSnapshot = {
      name: campaign.name as string,
      type,
      ...(currentSubject ? { subject_line: currentSubject } : {}),
      body: currentBody,
    };

    const userPrompt = trimmedInstruction
      ? `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nInstructie van de eigenaar:\n${trimmedInstruction}\n\nGeef 3 alternatieve versies.`
      : `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nGeef 3 alternatieve versies in verschillende tonen (warm, zakelijk, speels).`;

    const answer = await this.ai.generateText({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 2000,
      meta: {
        restaurantId,
        feature: 'campaign_refine',
      },
    });

    // Parser: pak het JSON-blok uit het antwoord. Als Claude per
    // ongeluk markdown gebruikt, vangen we het eerste { ... }-blok.
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new InternalServerErrorException(
        'Filly gaf geen leesbaar antwoord. Probeer het opnieuw.',
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      throw new InternalServerErrorException(
        "Kon Filly's antwoord niet lezen. Probeer het opnieuw.",
      );
    }

    const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
    const variants: Array<{ subject_line?: string; body: string }> = [];
    for (const v of rawVariants) {
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const body = typeof o.body === 'string' ? o.body.trim() : '';
      if (!body) continue;
      const variant: { subject_line?: string; body: string } = { body };
      if (
        typeof o.subject_line === 'string' &&
        o.subject_line.trim().length > 0
      ) {
        variant.subject_line = o.subject_line.trim().slice(0, 200);
      }
      variants.push(variant);
    }

    if (variants.length === 0) {
      throw new InternalServerErrorException(
        'Filly leverde geen bruikbare alternatieven. Probeer het opnieuw of geef een specifiekere instructie.',
      );
    }

    return { variants };
  }

  // Hard delete. Alleen toegestaan voor concept (nog niet verzonden)
  // of gearchiveerd (al uit-actief). Verzonden campagnes (ingepland/
  // actief/afgerond) zijn audit-relevant en mogen alleen via archive
  // van het zicht verdwijnen, niet uit de DB.
  async remove(restaurantId: string, id: string): Promise<{ id: string }> {
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (
      existing.status !== 'concept' &&
      existing.status !== 'gearchiveerd'
    ) {
      throw new BadRequestException(
        `Alleen concept- of gearchiveerde campagnes zijn te verwijderen (deze is ${existing.status}). Archiveer 'm eerst.`,
      );
    }

    // Cascade-delete: campaign_*_content + campaign_recipients gaan
    // automatisch mee dankzij de FK-constraints in migratie 0001
    // (on delete cascade). Geen extra cleanup nodig.
    const { error: delErr } = await this.supabase.client
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (delErr) throw new InternalServerErrorException(delErr.message);

    return { id };
  }
}
