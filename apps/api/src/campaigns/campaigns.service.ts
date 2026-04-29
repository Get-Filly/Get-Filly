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

    // Signed URLs voor media. We slaan paden op in de DB (niet
    // public URLs), dus frontend krijgt voor elke render verse signed
    // URLs. 1 uur expiry is genoeg voor dashboard-sessie. Falen we
    // op signing? Dan tonen we 'm gewoon zonder foto — niet de hele
    // detail-page laten crashen.
    let signedContent = content;
    if (content && campaign.type === 'social') {
      const paths = Array.isArray(content.media_urls)
        ? (content.media_urls as string[])
        : [];
      const signed = await Promise.all(
        paths.map((p) =>
          this.signMediaPath(p).catch(() => null),
        ),
      );
      signedContent = {
        ...content,
        media_urls: signed.filter((u): u is string => !!u),
      };
    } else if (
      content &&
      campaign.type === 'whatsapp' &&
      typeof content.media_url === 'string'
    ) {
      const signed = await this.signMediaPath(content.media_url).catch(
        () => null,
      );
      signedContent = { ...content, media_url: signed };
    }

    return { ...campaign, content: signedContent } as CampaignDetail;
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
    //
    // Bij body-wijziging wissen we ook de cached filly_variants en
    // resetten de regen-count: oude alternatieven matchen niet meer
    // met de nieuwe inhoud, en de eigenaar mag opnieuw 6 genereren
    // op basis van de bijgewerkte tekst.
    const bodyChanging = typeof input.body === 'string';
    if (typeof input.name === 'string' || bodyChanging) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof input.name === 'string') {
        const nameTrimmed = input.name.trim();
        if (!nameTrimmed) {
          throw new BadRequestException('Campagne-naam mag niet leeg zijn.');
        }
        updates.name = nameTrimmed;
      }
      if (bodyChanging) {
        updates.filly_variants = [];
        updates.filly_variants_regen_count = 0;
      }
      const { error: updErr } = await this.supabase.client
        .from('campaigns')
        .update(updates)
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

  // Lees de gecachte filly_variants + meta voor een concept-campagne.
  // Géén generatie: alleen retournering van wat al in DB staat. Wordt
  // door de frontend gebruikt bij page-open om te bepalen of we
  // moeten genereren (cache leeg) of bestaande tonen.
  async getVariants(
    restaurantId: string,
    id: string,
  ): Promise<{
    variants: Array<{ subject_line?: string; body: string }>;
    regenerate_count: number;
    can_regenerate: boolean;
  }> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('filly_variants, filly_variants_regen_count, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new BadRequestException('Campagne niet gevonden.');
    }

    const variants = Array.isArray(data.filly_variants)
      ? (data.filly_variants as Array<{
          subject_line?: string;
          body: string;
        }>)
      : [];
    const regenerate_count =
      typeof data.filly_variants_regen_count === 'number'
        ? data.filly_variants_regen_count
        : 0;
    // Max 2 generaties (eerste set + 1× extra). Daarna moet de
    // eigenaar handmatig bewerken — zo houden we Claude-kosten
    // onder controle bij druk-klik-gedrag.
    const can_regenerate =
      data.status === 'concept' && regenerate_count < 2;

    return { variants, regenerate_count, can_regenerate };
  }

  // Genereert 3 alternatieven en voegt ze toe aan de cache. Wordt
  // gebruikt zowel voor de eerste set als voor de "Genereer 3 nieuwe"-
  // klik. Server is bron van waarheid voor count + appended state:
  //   count=0 → genereer 3, save, count=1
  //   count=1 → genereer 3 extra, append, count=2 (totaal 6)
  //   count>=2 → BadRequest (kostenbeheersing)
  //
  // De optionele instructie ("korter", "speelser") stuurt de varianten
  // die kant op. Zonder instructie krijg je 3 gevarieerde versies
  // (warm/zakelijk/speels).
  async refine(
    restaurantId: string,
    id: string,
    instruction?: string,
  ): Promise<{
    variants: Array<{ subject_line?: string; body: string }>;
    regenerate_count: number;
    can_regenerate: boolean;
  }> {
    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select(
        'id, type, status, name, filly_variants, filly_variants_regen_count',
      )
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

    const currentCount =
      typeof campaign.filly_variants_regen_count === 'number'
        ? campaign.filly_variants_regen_count
        : 0;
    if (currentCount >= 2) {
      throw new BadRequestException(
        'Maximum aantal generaties bereikt voor deze campagne (3 + 3 = 6). Bewerk handmatig of kies een bestaande versie.',
      );
    }
    const existingVariants = Array.isArray(campaign.filly_variants)
      ? (campaign.filly_variants as Array<{
          subject_line?: string;
          body: string;
        }>)
      : [];

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

    // Append aan bestaande cache + verhoog count. Behoud max 6 totaal
    // ook als Claude er meer geeft (parser laat alleen 3 door, maar
    // defensieve cap.)
    const newAll = [...existingVariants, ...variants].slice(0, 6);
    const newCount = currentCount + 1;

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        filly_variants: newAll,
        filly_variants_regen_count: newCount,
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return {
      variants: newAll,
      regenerate_count: newCount,
      can_regenerate: newCount < 2,
    };
  }

  // Upload een foto en koppel 'm aan een concept-campagne. Patroon:
  //   - Bestand wordt opgeslagen in bucket 'campaign-media' onder
  //     <restaurant_id>/<campaign_id>/<timestamp>-<safeName>
  //   - Voor social: vervangt media_urls[] door [path] (max 1 foto in v1)
  //   - Voor whatsapp: zet media_url op path
  //   - Voor mail: weigeren (header-image is later werk)
  // Bij her-upload wissen we de oude file zodat we geen weeszooi
  // krijgen in storage.
  async uploadMedia(
    restaurantId: string,
    campaignId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<{
    path: string;
    signed_url: string;
  }> {
    const allowed = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    if (!allowed.has(file.mimeType.toLowerCase())) {
      throw new BadRequestException(
        `Bestandstype ${file.mimeType} wordt niet ondersteund. Upload JPG, PNG, WebP of GIF.`,
      );
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Bestand is te groot (${Math.round(file.buffer.length / 1024 / 1024)}MB). Maximaal 10MB.`,
      );
    }

    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', campaignId)
      .maybeSingle();
    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (campaign.status !== 'concept') {
      throw new BadRequestException(
        `Foto's kunnen alleen bij concept-campagnes worden geüpload (deze is ${campaign.status}).`,
      );
    }
    if (campaign.type === 'mail') {
      throw new BadRequestException(
        'Mail-campagnes ondersteunen nog geen foto-upload (komt later).',
      );
    }

    // Oude file wissen om wees-bestanden te voorkomen.
    await this.deleteMediaFiles(restaurantId, campaignId).catch((err) => {
      // Niet fataal: zelfs als opruim faalt, kunnen we de nieuwe upload
      // doorzetten. Logwaardig zodat we 't kunnen monitoren.
      console.warn(
        `Oude campaign-media kon niet opgeruimd worden voor ${campaignId}: ${err.message}`,
      );
    });

    // Pad samenstellen. Sanitize de filename: alleen alfanumeriek +
    // streepje + punt voor extensie. Te streng of te los is hier
    // niet waardevol — we willen path-traversal voorkomen.
    const safeName = file.originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const path = `${restaurantId}/${campaignId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await this.supabase.client.storage
      .from('campaign-media')
      .upload(path, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });
    if (upErr) throw new InternalServerErrorException(upErr.message);

    // Path in juiste content-tabel zetten. Voor social: array met 1
    // path. Voor whatsapp: scalar.
    if (campaign.type === 'social') {
      const { error: updErr } = await this.supabase.client
        .from('campaign_social_content')
        .update({
          media_urls: [path],
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaignId);
      if (updErr) throw new InternalServerErrorException(updErr.message);
    } else {
      const { error: updErr } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .update({
          media_url: path,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaignId);
      if (updErr) throw new InternalServerErrorException(updErr.message);
    }

    const signed_url = await this.signMediaPath(path);
    return { path, signed_url };
  }

  // Wist de huidige foto van een concept-campagne (storage + DB-veld).
  async deleteMedia(
    restaurantId: string,
    campaignId: string,
  ): Promise<{ id: string }> {
    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status')
      .eq('restaurant_id', restaurantId)
      .eq('id', campaignId)
      .maybeSingle();
    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (campaign.status !== 'concept') {
      throw new BadRequestException(
        `Foto verwijderen kan alleen bij concept-campagnes (deze is ${campaign.status}).`,
      );
    }

    await this.deleteMediaFiles(restaurantId, campaignId);

    if (campaign.type === 'social') {
      const { error: updErr } = await this.supabase.client
        .from('campaign_social_content')
        .update({
          media_urls: [],
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaignId);
      if (updErr) throw new InternalServerErrorException(updErr.message);
    } else if (campaign.type === 'whatsapp') {
      const { error: updErr } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .update({
          media_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaignId);
      if (updErr) throw new InternalServerErrorException(updErr.message);
    }

    return { id: campaignId };
  }

  // Helper: list + delete alle objects onder <restaurant>/<campaign>/.
  // Gebruikt door uploadMedia (her-upload-cleanup) en deleteMedia.
  private async deleteMediaFiles(
    restaurantId: string,
    campaignId: string,
  ): Promise<void> {
    const prefix = `${restaurantId}/${campaignId}`;
    const { data: existing, error: listErr } =
      await this.supabase.client.storage
        .from('campaign-media')
        .list(prefix, { limit: 100 });
    if (listErr) throw new Error(listErr.message);
    if (!existing || existing.length === 0) return;
    const paths = existing.map((f) => `${prefix}/${f.name}`);
    const { error: rmErr } = await this.supabase.client.storage
      .from('campaign-media')
      .remove(paths);
    if (rmErr) throw new Error(rmErr.message);
  }

  // Suggesteer een verzendmoment voor een concept-campagne via Filly.
  // Cache-check: als er al een suggested_scheduled_for in DB staat,
  // returnen we die direct (geen Claude-call). Pas wanneer eigenaar
  // expliciet om een nieuw voorstel vraagt (force=true) overschrijven
  // we 'm. Reasoning komt mee zodat user weet waarom dit moment.
  async suggestSchedule(
    restaurantId: string,
    id: string,
    force: boolean = false,
  ): Promise<{
    suggested_scheduled_for: string;
    suggested_scheduled_reasoning: string;
  }> {
    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select(
        'id, type, status, name, suggested_scheduled_for, suggested_scheduled_reasoning',
      )
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();
    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) {
      throw new BadRequestException('Campagne niet gevonden.');
    }

    // Cache-hit zonder force: returnen wat er al staat.
    if (
      !force &&
      campaign.suggested_scheduled_for &&
      campaign.suggested_scheduled_reasoning
    ) {
      return {
        suggested_scheduled_for: campaign.suggested_scheduled_for as string,
        suggested_scheduled_reasoning:
          campaign.suggested_scheduled_reasoning as string,
      };
    }

    // Restaurant-context: type, doelgroep, brand_tone — beïnvloeden
    // het optimale tijdstip. Bv. een fine-dining-restaurant doet
    // andere uren dan een lunch-bar.
    const { data: restaurant } = await this.supabase.client
      .from('restaurants')
      .select('name, type, target_audience, brand_tone')
      .eq('id', restaurantId)
      .maybeSingle();

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor de horeca. Je stelt het beste verzendmoment voor een campagne voor.

Geef ALTIJD exact dit JSON-formaat terug, zonder markdown-codeblok:

{
  "datetime_iso": "<ISO 8601 datetime in Europe/Amsterdam, bv. 2026-04-30T19:00:00+02:00>",
  "reasoning": "<korte NL-tekst, max 200 tekens, waarom dit moment>"
}

Regels voor de datum:
- KIES een tijdstip vanaf morgen, niet vandaag (geef de eigenaar tijd om te reviewen).
- Vandaag is ${todayIso}.

Regels voor het tijdstip per type:
- "mail" → 's ochtends 9:00–10:30 (open-rate piek voor B2C horeca) of 's avonds 19:30–20:30 (lees-piek tijdens binge-momenten).
- "social" → 17:00–20:00 (Instagram/Facebook prime time) of weekend rond 11:00 (brunch-mood).
- "whatsapp" → 18:00–20:30 (mensen plannen avond) — niet later dan 21:00 (te laat voelt opdringerig).

Regels voor de dag:
- Vermijd zondagochtend voor B2C-marketing (kerk-tijd, slecht open-rate).
- Donderdag/vrijdag scoren goed voor weekend-acties.
- Maandag is laag voor entertainment-promo's.

Reasoning kort, helder, in NL. Bv. "Donderdag 19:30 — open-rates piekten op donderdagavond bij vergelijkbare bistro's."`;

    const userPrompt = `Campagne:
- Type: ${campaign.type}
- Naam: ${campaign.name}

Restaurant:
- Naam: ${restaurant?.name ?? 'onbekend'}
- Type: ${restaurant?.type ?? 'restaurant'}
- Doelgroep: ${restaurant?.target_audience ?? 'algemeen publiek'}
- Toon: ${restaurant?.brand_tone ?? 'casual'}

Geef het beste verzendmoment.`;

    const answer = await this.ai.generateText({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 400,
      meta: {
        restaurantId,
        feature: 'schedule_suggestion',
      },
    });

    // Parse JSON uit antwoord. Bij parse-fout: error gooien — frontend
    // toont "kon voorstel niet genereren".
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new InternalServerErrorException(
        'Filly gaf geen leesbaar antwoord. Probeer opnieuw.',
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      throw new InternalServerErrorException(
        "Kon Filly's antwoord niet lezen. Probeer opnieuw.",
      );
    }

    const datetimeIso =
      typeof parsed.datetime_iso === 'string'
        ? parsed.datetime_iso.trim()
        : '';
    const reasoning =
      typeof parsed.reasoning === 'string'
        ? parsed.reasoning.trim().slice(0, 500)
        : '';

    if (!datetimeIso || Number.isNaN(Date.parse(datetimeIso))) {
      throw new InternalServerErrorException(
        'Filly leverde geen geldig tijdstip. Probeer opnieuw.',
      );
    }

    // Cache + retourneer.
    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        suggested_scheduled_for: datetimeIso,
        suggested_scheduled_reasoning: reasoning,
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return {
      suggested_scheduled_for: datetimeIso,
      suggested_scheduled_reasoning: reasoning,
    };
  }

  // Set de definitieve scheduled_for voor een concept-campagne.
  // Wordt aangeroepen wanneer eigenaar het Filly-voorstel accepteert
  // óf zelf een tijdstip kiest. Geen status-transitie hier — die
  // gebeurt apart via updateStatus (concept → ingepland).
  async setSchedule(
    restaurantId: string,
    id: string,
    datetimeIso: string,
  ): Promise<{ id: string; scheduled_for: string }> {
    if (!datetimeIso || Number.isNaN(Date.parse(datetimeIso))) {
      throw new BadRequestException('Ongeldig tijdstip.');
    }

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
    if (existing.status !== 'concept' && existing.status !== 'ingepland') {
      throw new BadRequestException(
        `Tijdstip aanpassen kan alleen bij concept of ingepland (deze is ${existing.status}).`,
      );
    }

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        scheduled_for: datetimeIso,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return { id, scheduled_for: datetimeIso };
  }

  // Helper: maak signed URL voor 1 storage-pad. 1 uur geldig — past
  // bij dashboard-sessie-duur. Voor verzend-API's straks een verse
  // URL genereren met langere expiry.
  async signMediaPath(path: string): Promise<string> {
    const { data, error } = await this.supabase.client.storage
      .from('campaign-media')
      .createSignedUrl(path, 60 * 60);
    if (error) throw new InternalServerErrorException(error.message);
    return data.signedUrl;
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
