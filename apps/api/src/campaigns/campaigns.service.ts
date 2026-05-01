import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { AnonymizationService } from '../anonymization/anonymization.service';
import type Anthropic from '@anthropic-ai/sdk';

// Schema voor 3-varianten-tool. minItems/maxItems forceert
// precies 3 alternatieven, schema garandeert dat elke variant
// een body heeft.
const CAMPAIGN_VARIANTS_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          subject_line: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['body'],
      },
    },
  },
  required: ['variants'],
} as const satisfies Anthropic.Tool.InputSchema;

type CampaignVariantsFromTool = {
  variants: Array<{ subject_line?: string; body: string }>;
};

// Schema voor tijdstip-suggestie. Strikt ISO-8601 datetime in
// Europe/Amsterdam (zelfde format als de DB verwacht) + korte
// reasoning die we tonen aan de eigenaar.
const CAMPAIGN_SCHEDULE_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    datetime_iso: {
      type: 'string',
      description:
        'ISO-8601 datetime in Europe/Amsterdam, bv. "2026-05-12T19:30:00+02:00".',
    },
    reasoning: {
      type: 'string',
      description:
        'Korte NL-uitleg (max 200 tekens) waarom dit tijdstip past.',
    },
  },
  required: ['datetime_iso', 'reasoning'],
} as const satisfies Anthropic.Tool.InputSchema;

type CampaignScheduleSuggestionFromTool = {
  datetime_iso: string;
  reasoning: string;
};

export type CampaignType = 'mail' | 'social' | 'whatsapp';
export type CampaignStatus =
  | 'concept'
  | 'ingepland'
  | 'actief'
  | 'afgerond';

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
  // Tijdstip waarop een Filly-variant is toegepast op deze campagne.
  // Null = nog geen variant gekozen. UI verbergt op basis hiervan
  // de "Met Filly bewerken"-sectie.
  variant_applied_at: string | null;
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly ai: AiService,
    // RestaurantContextService levert profile + menu + live blocks die
    // Filly nodig heeft voor goede campagne-varianten (echte gerechten,
    // USPs, doelgroep) en realistische tijdstip-suggesties (rekening
    // houdend met bezetting + special events).
    private readonly context: RestaurantContextService,
    private readonly audit: AuditLogService,
    // AnonymizationService bouwt bij `status → afgerond` een
    // geanonimiseerde benchmark-rij op (Recital 26 GDPR). Fail-soft
    // — een falende benchmark mag de status-overgang nooit blokkeren.
    private readonly anonymization: AnonymizationService,
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
      // Optioneel: bij approve van een chat-suggestion (waar Filly
      // al 3 varianten genereerde) geven we die door als startset
      // van filly_variants. Voorkomt dat CampaignRefinePanel ze
      // bij eerste open opnieuw genereert (= dubbele kosten +
      // 6 ipv 3 opties zichtbaar).
      seed_variants?: Array<{ subject_line?: string; body: string }>;
    },
    // userId is verplicht: zonder actor in de audit-log verliezen we
    // bij klant-support traceerbaarheid ("wie heeft die campagne
    // aangemaakt?"). Beide callers (controller-direct + via
    // SuggestionsService.approve) reiken 'm door.
    userId: string,
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

    // Sanitize seed-variants: alleen entries met body, en plak een
    // cap op om ongegrenste payloads te voorkomen.
    const seededVariants = (input.seed_variants ?? [])
      .filter((v) => typeof v.body === 'string' && v.body.trim().length > 0)
      .map((v) => ({
        body: v.body.trim(),
        subject_line: v.subject_line?.trim() || undefined,
      }))
      .slice(0, 6);

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
        // Variants meegegeven via approve? Schrijf 'm direct als
        // cache zodat de detail-pagina geen nieuwe Claude-call doet.
        // regen_count = 1 (NIET 0) wanneer er seeds zijn: de chat-3
        // tellen al als de eerste round. Eigenaar mag dan nog 1×
        // regenerate (count → 2, can_regenerate=false bij count>=2).
        // Totaal max = chat-3 + regen-3 = 6 alternatieven, zoals in
        // de oorspronkelijke 0014-design bedoeld.
        filly_variants: seededVariants.length > 0 ? seededVariants : null,
        filly_variants_regen_count: seededVariants.length > 0 ? 1 : 0,
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

    // Audit: nieuwe campagne aangemaakt door een specifieke user.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_created',
      entity_type: 'campaign',
      entity_id: campaignId,
      payload: {
        name,
        type: input.type,
        source: input.subject_line ? 'mail-with-subject' : 'inline',
      },
    });

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
      // Als true: deze update komt voort uit "Pas variant toe"-knop.
      // We resetten dan NIET filly_variants/regen_count en zetten
      // variant_applied_at op now() zodat de UI de "Met Filly
      // bewerken"-sectie definitief verbergt voor deze campagne.
      from_variant?: boolean;
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
    // Bij handmatige body-wijziging (from_variant=false) wissen we
    // de cached filly_variants en resetten regen-count: oude
    // alternatieven matchen niet meer met de nieuwe inhoud.
    // Bij variant-apply (from_variant=true): NIET wissen — variant is
    // gekozen, klaar, en variant_applied_at gaat aan zodat de UI de
    // refine-sectie verbergt.
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
        if (input.from_variant) {
          // Variant gekozen — markeer en behoud cache.
          updates.variant_applied_at = new Date().toISOString();
        } else {
          // Handmatige edit — cache wissen.
          updates.filly_variants = [];
          updates.filly_variants_regen_count = 0;
        }
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

  // Status-transitie. Lineaire levenscyclus zonder zijpaden:
  //   concept   → ingepland          (Inplannen-knop)
  //   ingepland → actief             (Activeer-knop)
  //   actief    → afgerond           (Stop-knop)
  //   afgerond  → eindstaat          (geen verdere actie mogelijk)
  // Verwijderen gebeurt apart via remove() en mag op concept of
  // ingepland (zolang de campagne nog niet daadwerkelijk uitgegaan is).
  async updateStatus(
    restaurantId: string,
    id: string,
    nextStatus: CampaignStatus,
    userId: string,
  ): Promise<{ id: string; status: CampaignStatus }> {
    const allowed: Record<CampaignStatus, CampaignStatus[]> = {
      concept: ['ingepland'],
      ingepland: ['actief'],
      actief: ['afgerond'],
      afgerond: [],
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

    // Audit: status-overgang. Cruciaal voor debugging ("waarom staat
    // deze campagne nu op afgerond terwijl ie nog actief had moeten
    // zijn") en voor compliance-audit ("wie heeft de campagne stopgezet").
    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_status_changed',
      entity_type: 'campaign',
      entity_id: id,
      payload: { from: currentStatus, to: nextStatus },
    });

    // Bij afronding: schrijf een geanonimiseerde benchmark-rij weg
    // zodat Filly deze ervaring later kan gebruiken om voorstellen
    // te onderbouwen ("voor italiaanse zaken in NH werkte thema X").
    // Fail-soft via de service zelf — gebruiker merkt nooit als 'm
    // faalt; alleen logger.warn in de backend.
    if (nextStatus === 'afgerond') {
      await this.anonymization.benchmarkCampaign(id);
    }

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

    // Profile + menu blocks ophalen: Filly weet zo welke gerechten op
    // de kaart staan, USPs/doelgroep/sfeer/brand_tone, en kan in zijn
    // varianten verwijzen naar échte gerechten met échte prijzen i.p.v.
    // generieke "lekker-gerecht"-tekst. Live-block laten we weg —
    // varianten gaan over een toekomstige verzending, niet over
    // actuele bezetting van vandaag.
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    // System-prompt: Filly krijgt de huidige campagne + (optionele)
    // instructie + profiel + menu en moet 3 verschillende alternatieven
    // leveren via tool 'generate_campaign_variants'. Schema dwingt
    // precies 3 varianten af; toon-verschillen sturen we hier in tekst.
    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor het hieronder beschreven restaurant. Je krijgt een bestaande campagne en moet 3 alternatieve versies bedenken die specifiek bij DEZE zaak passen.

Je antwoord komt via de tool 'generate_campaign_variants'. Vul het schema met precies 3 alternatieven.

Inhoudsregels:
- Maak de 3 varianten écht verschillend in toon/insteek/lengte
  (bv. v1 = warm-uitnodigend, v2 = zakelijk-direct, v3 = speels-kort).
  Niet alleen wat woorden anders.
- Behoud de kern van de boodschap (datum, aanbod, USP) tenzij de
  instructie expliciet vraagt om iets te wijzigen.
- Verwerk concrete elementen uit het profiel (USPs, doelgroep, sfeer)
  en menu (echte gerechten + prijzen) zodat de varianten herkenbaar
  bij DEZE zaak passen.
- Refereer ALLEEN aan menu-items die letterlijk in MENU staan. Verzin
  geen gerechten erbij, ook niet als ze "logisch" klinken.
- subject_line alleen voor mail-campagnes; voor social/whatsapp laat
  je 'm weg.
- body bevat de volledige uitgeschreven tekst.
- Schrijf in het Nederlands. Match de brand_tone uit het profiel.
- Verzin geen feiten/cijfers die niet in de oorspronkelijke versie
  of in het profiel/menu staan.

---
CONTEXT — alles wat je weet over deze zaak:

${profileBlock}

${menuBlock}
---`;

    const currentSnapshot = {
      name: campaign.name as string,
      type,
      ...(currentSubject ? { subject_line: currentSubject } : {}),
      body: currentBody,
    };

    const userPrompt = trimmedInstruction
      ? `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nInstructie van de eigenaar:\n${trimmedInstruction}\n\nGeef 3 alternatieve versies.`
      : `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nGeef 3 alternatieve versies in verschillende tonen (warm, zakelijk, speels).`;

    const parsed = await this.ai.generateStructured<CampaignVariantsFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 3000,
      toolName: 'generate_campaign_variants',
      toolDescription:
        'Lever precies 3 alternatieve campagne-varianten in verschillende tonen op basis van de huidige versie en (optionele) instructie.',
      inputSchema: CAMPAIGN_VARIANTS_SCHEMA,
      meta: {
        restaurantId,
        feature: 'campaign_refine',
      },
      // System bevat profile + menu — bij regenerate (1× extra binnen
      // 5 min na initial) bespaart caching ~90% input-tokens.
      cacheSystem: true,
    });

    // Schema garandeert dat variants een array van 3 is met body.
    // We trimmen body en cappen subject_line op 200 voor DB-veiligheid.
    const variants: Array<{ subject_line?: string; body: string }> = [];
    for (const v of parsed.variants) {
      const body = v.body.trim();
      if (!body) continue;
      const variant: { subject_line?: string; body: string } = { body };
      if (v.subject_line && v.subject_line.trim().length > 0) {
        variant.subject_line = v.subject_line.trim().slice(0, 200);
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
        'id, type, status, name, suggested_scheduled_for, suggested_scheduled_reasoning, scheduling_history',
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

    // History-state lezen voor de cycle-logic.
    const history = Array.isArray(campaign.scheduling_history)
      ? (campaign.scheduling_history as Array<{
          datetime_iso: string;
          reasoning: string;
          generated_at?: string;
        }>)
      : [];

    // Cyclen-pad: na 4 unieke alternatieven (current + 3 in history)
    // genereren we niet meer. Round-robin door de 4 alternatieven —
    // pak oudste uit history, schuif huidige current naar einde.
    // Geen Claude-call.
    const MAX_UNIQUE_BEFORE_CYCLE = 3; // history-cap; 3 + current = 4 totaal
    if (
      force &&
      history.length >= MAX_UNIQUE_BEFORE_CYCLE &&
      campaign.suggested_scheduled_for &&
      campaign.suggested_scheduled_reasoning
    ) {
      const next = history[0];
      const newHistory = [
        ...history.slice(1),
        {
          datetime_iso: campaign.suggested_scheduled_for as string,
          reasoning: campaign.suggested_scheduled_reasoning as string,
          generated_at: new Date().toISOString(),
        },
      ];
      const { error: cycleErr } = await this.supabase.client
        .from('campaigns')
        .update({
          suggested_scheduled_for: next.datetime_iso,
          suggested_scheduled_reasoning: next.reasoning,
          scheduling_history: newHistory,
        })
        .eq('id', id)
        .eq('restaurant_id', restaurantId);
      if (cycleErr) throw new InternalServerErrorException(cycleErr.message);

      return {
        suggested_scheduled_for: next.datetime_iso,
        suggested_scheduled_reasoning: next.reasoning,
      };
    }

    // Generate-pad: genereer nieuwe via Claude. De huidige current
    // (als die er is) gaat eerst naar history zodat we 'm later
    // kunnen recyclen.
    const newHistory =
      force &&
      campaign.suggested_scheduled_for &&
      campaign.suggested_scheduled_reasoning
        ? [
            ...history,
            {
              datetime_iso: campaign.suggested_scheduled_for as string,
              reasoning: campaign.suggested_scheduled_reasoning as string,
              generated_at: new Date().toISOString(),
            },
          ].slice(-MAX_UNIQUE_BEFORE_CYCLE)
        : history;

    // Profile + live blocks. Profile geeft Filly de identiteit (type,
    // doelgroep, openingstijden, special events) en live-block geeft
    // 'm de actuele bezetting komende dagen — handig om druk-bezette
    // momenten te mijden of juist een lage-bezettingsdag te kiezen
    // als verzenddoel. Menu-block laten we weg — irrelevant voor het
    // tijdstip-vraagstuk.
    const [profileBlock, liveBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildLiveBlock(restaurantId).catch(() => ''),
    ]);

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const systemPrompt = `Je bent Filly, een AI-marketingassistent voor het hieronder beschreven restaurant. Je stelt het beste verzendmoment voor een campagne voor.

Je antwoord komt via de tool 'suggest_campaign_schedule'. Vul datetime_iso (ISO-8601 in Europe/Amsterdam) en een korte reasoning.

Regels voor de datum:
- KIES een tijdstip vanaf morgen, niet vandaag (geef de eigenaar tijd om te reviewen).
- Vandaag is ${todayIso}.
- Houd rekening met de bezetting (uit het live-blok): mijd dagen die al >85% bezet zijn (zonde van de mailing) en geef juist voorrang aan dagen <50% bezetting bij activatie-campagnes.
- Houd rekening met openingstijden uit het profiel — geen verzending plannen op een dag dat de zaak gesloten is.
- Houd rekening met special events uit het profiel (bv. wekelijks terugkerende avonden) — die kunnen het verzendmoment juist sterker maken (verzend dezelfde dag) of zwakker (verzend ervoor zodat mensen kunnen plannen).

Regels voor het tijdstip per type:
- "mail" → 's ochtends 9:00–10:30 (open-rate piek voor B2C horeca) of 's avonds 19:30–20:30 (lees-piek tijdens binge-momenten).
- "social" → 17:00–20:00 (Instagram/Facebook prime time) of weekend rond 11:00 (brunch-mood).
- "whatsapp" → 18:00–20:30 (mensen plannen avond) — niet later dan 21:00 (te laat voelt opdringerig).

Regels voor de dag:
- Vermijd zondagochtend voor B2C-marketing (kerk-tijd, slecht open-rate).
- Donderdag/vrijdag scoren goed voor weekend-acties.
- Maandag is laag voor entertainment-promo's.

Reasoning kort, helder, in NL — verwijs naar concrete data uit profiel of bezetting. Bv. "Donderdag 19:30 — donderdag is qua bezetting nog open en past bij jullie 'familiediner'-segment."

---
CONTEXT — restaurant-profiel + actuele bezetting:

${profileBlock}

${liveBlock}
---`;

    const userPrompt = `Campagne:
- Type: ${campaign.type}
- Naam: ${campaign.name}

Geef het beste verzendmoment.`;

    const parsed =
      await this.ai.generateStructured<CampaignScheduleSuggestionFromTool>({
        system: systemPrompt,
        prompt: userPrompt,
        model: 'claude-sonnet-4-6',
        maxTokens: 600,
        toolName: 'suggest_campaign_schedule',
        toolDescription:
          'Stel het beste verzendmoment voor de campagne voor, met argumentatie.',
        inputSchema: CAMPAIGN_SCHEDULE_SUGGESTION_SCHEMA,
        meta: {
          restaurantId,
          feature: 'schedule_suggestion',
        },
      });

    // Schema garandeert dat datetime_iso een string is, maar of 'm
    // ook een GELDIGE date-string is moeten we hier zelf checken
    // (JSON-schema kent format: 'date-time' niet uniform overal).
    const datetimeIso = parsed.datetime_iso.trim();
    const reasoning = parsed.reasoning.trim().slice(0, 500);

    if (!datetimeIso || Number.isNaN(Date.parse(datetimeIso))) {
      throw new InternalServerErrorException(
        'Filly leverde geen geldig tijdstip. Probeer opnieuw.',
      );
    }

    // Cache + retourneer. scheduling_history is hierboven al
    // opnieuw opgebouwd (current → history bij force=true).
    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        suggested_scheduled_for: datetimeIso,
        suggested_scheduled_reasoning: reasoning,
        scheduling_history: newHistory,
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

  // Hard delete. Toegestaan voor concept én ingepland — een ingeplande
  // campagne is nog niet uitgegaan, dus verwijderen heeft geen audit-
  // impact (geen ontvangers, geen meet-data). Actieve en afgeronde
  // campagnes zijn audit-relevant: die blijven in de DB staan.
  async remove(
    restaurantId: string,
    id: string,
    userId: string,
  ): Promise<{ id: string }> {
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
        `Alleen concept- of ingeplande campagnes zijn te verwijderen (deze is ${existing.status}).`,
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

    // Audit: campagne verwijderd. Onomkeerbaar dus extra belangrijk
    // dat we 't loggen — we kunnen later aantonen dat er niets stilletjes
    // weg is gemoffeld.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_deleted',
      entity_type: 'campaign',
      entity_id: id,
      payload: { previous_status: existing.status },
    });

    return { id };
  }
}
