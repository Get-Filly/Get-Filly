import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
  constructor(private readonly supabase: SupabaseService) {}

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
