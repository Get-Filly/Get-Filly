import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
// Service-role-client (RLS-bypass) — nodig voor de context-loze cron
// (geen ingelogde user), zie runScheduledSocial.
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import {
  mapCampaignTypeToChannel,
  formatTimingForPrompt,
  formatChannelRulesForPrompt,
} from '../ai/filly-brain.config';
import { buildExternalFactorsBlock } from '../ai/timing-factors';
import { enforceCopyLength } from '../ai/copy-length.guard';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../common/audit-log.service';
import { AnonymizationService } from '../anonymization/anonymization.service';
import { CampaignPerformanceService } from './campaign-performance.service';
import { CampaignFingerprintService } from './campaign-fingerprint.service';
// MetaService: publiceert social-campagnes naar Facebook/Instagram via de
// bestaande, goedgekeurde Meta-koppeling (token-opslag + /publish).
import { MetaService } from '../meta/meta.service';
// TikTokService: publiceert social-campagnes met platform 'tiktok' via de
// Content Posting API (Direct Post). Spiegelt de Meta-publish.
import { TikTokService } from '../tiktok/tiktok.service';
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
    alternative_datetime_iso: {
      type: 'string',
      description:
        'Tweede-beste moment (ISO-8601, Europe/Amsterdam): ander dagdeel of andere dag dan het primaire voorstel.',
    },
    alternative_reasoning: {
      type: 'string',
      description:
        'Eén zin NL: de trade-off van het alternatief t.o.v. het primaire moment.',
    },
  },
  required: ['datetime_iso', 'reasoning'],
} as const satisfies Anthropic.Tool.InputSchema;

type CampaignScheduleSuggestionFromTool = {
  datetime_iso: string;
  reasoning: string;
  alternative_datetime_iso?: string;
  alternative_reasoning?: string;
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
  // Per 2026-05-07 fase 4: group_id om bundle-membership te bepalen
  // op de /campagnes-list. Null = stand-alone campagne.
  group_id: string | null;
  scheduled_for: string | null;
  // Per 2026-05-12: korte body-preview voor de kanban-cards.
  // Komt voor mail uit campaign_mail_content.body_plain, voor
  // social uit campaign_social_content.caption. Null als de
  // campagne nog geen content heeft (verse concept).
  body_preview: string | null;
  // Per 2026-05-12 (mig 0040): soft-delete-tijdstip. Optional want
  // findAll() filtert deze al weg; alleen findDeleted() vult 'm.
  deleted_at?: string | null;
};

// Shape van een enkele variant binnen campaigns.variants[]. Identiek
// aan ai_suggestions.suggested_campaign.channels[].variants zodat de
// unified-detail-page één component over voorstel én campagne kan
// renderen.
export type CampaignVariant = {
  subject_line?: string | null;
  body: string;
};

export type CampaignDetail = Campaign & {
  subject_line: string | null;
  body: string | null;
  preview_data: Record<string, unknown> | null;
  // scheduled_for zit nu in Campaign (per 2026-05-07).
  executed_at: string | null;
  tags: string[] | null;
  created_at: string;
  content: Record<string, unknown> | null;
  // Per 2026-05-12: Filly's reasoning uit het bijbehorende voorstel.
  // Wordt gejoined via campaigns.ai_suggestion_id → ai_suggestions.
  // Null = campagne komt niet uit een voorstel (handmatig aangemaakt
  // of het voorstel is intussen verwijderd). Detail-pagina toont
  // een "Waarom dit voorstel"-card als deze gevuld is.
  reasoning: string | null;
  // Per 2026-05-13 (mig 0041): alle versies + welke 'Gekozen' is.
  // Bron-van-waarheid voor de Versies-grid op de unified-detail-page;
  // body/subject_line hierboven zijn afgeleid van
  // variants[selected_variant_index].
  variants: CampaignVariant[];
  selected_variant_index: number;
  // Aantal recipients waar deze campagne naartoe is verstuurd. Voor
  // mail-type leest dit uit campaign_sends. Gebruikt door de UI om
  // het status-label aan te passen ("Actief" → "Klaar voor verzending"
  // wanneer count=0; → "Verstuurd" zodra >0).
  sent_count: number;
};

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly ai: AiService,
    // RestaurantContextService levert profile + menu + live blocks die
    // Filly nodig heeft voor goede campagne-varianten (echte gerechten,
    // USPs, doelgroep) en realistische tijdstip-suggesties (rekening
    // houdend met bezetting + special events).
    private readonly context: RestaurantContextService,
    // Lokale evenementen binnen de staffel-radius: extra signaal voor
    // het verzendmoment (event = piek- óf uitwijk-moment).
    private readonly events: EventsService,
    private readonly audit: AuditLogService,
    // AnonymizationService bouwt bij `status → afgerond` een
    // geanonimiseerde benchmark-rij op (Recital 26 GDPR). Fail-soft
    //, een falende benchmark mag de status-overgang nooit blokkeren.
    private readonly anonymization: AnonymizationService,
    // CampaignPerformanceService: bij status→actief maken we een
    // performance-rij aan zodat alle webhook-events (delivered/opened/
    // clicked) en attributies een doel hebben om bij te werken.
    private readonly performance: CampaignPerformanceService,
    // CampaignFingerprintService: bij status→actief extraheren we
    // stilistische metadata (opening / hashtags / cta / dish) voor
    // de leerloop + anti-repetitie (filly-brein hfst 8 + 9).
    private readonly fingerprint: CampaignFingerprintService,
    // MetaService: social-campagne → FB/IG-post. Request-scoped net als
    // deze service, dus injecteren kan zonder scope-conflict.
    private readonly meta: MetaService,
    // TikTokService: social-campagne met platform 'tiktok' → Direct Post.
    private readonly tiktok: TikTokService,
    // Admin (service-role) client voor de cron: die draait zonder
    // ingelogde user, dus de request-client (RLS) kan daar niet.
    private readonly admin: SupabaseService,
  ) {}

  /**
   * ============================================================
   * publishSocialCampaign — social-campagne naar Facebook/Instagram
   * ============================================================
   * Plaatst de caption + foto van een social-campagne op de gekoppelde
   * FB-pagina en/of het IG-account, via de bestaande Meta-publish-flow.
   *
   * Gebruikt door BEIDE triggers:
   *   - direct ("Activeer nu" in de detail-page),
   *   - straks de cron voor ingeplande campagnes (fase B).
   *
   * Idempotent: al gepubliceerd (published_at gevuld) → no-op, zodat
   * her-activeren of een dubbele cron-run niet dubbel post.
   *
   * Vereist een actieve Meta-koppeling MET gekozen pagina (zie de
   * koppelingen-tab). Ontbreekt die → MetaService gooit een duidelijke
   * BadRequest die naar boven bubbelt (de activeer-flow toont 'm).
   */
  async publishSocialCampaign(
    restaurantId: string,
    campaignId: string,
    useAdmin = false,
  ): Promise<{
    published: boolean;
    alreadyPublished?: boolean;
    skipped?: boolean;
    reason?: string;
    postIds?: Record<string, string>;
  }> {
    // De cron (runScheduledSocial) draait zonder ingelogde user → admin-
    // client. Bij user-flows ("Activeer nu") blijft de request-client (RLS).
    const client = useAdmin ? this.admin.client : this.supabase.client;
    // 1. Campagne ophalen, dubbel gescoped op restaurant (defense-in-depth).
    const { data: campaign, error: cErr } = await client
      .from('campaigns')
      .select('id, type')
      .eq('restaurant_id', restaurantId)
      .eq('id', campaignId)
      .maybeSingle();
    if (cErr) throw new InternalServerErrorException(cErr.message);
    if (!campaign) throw new BadRequestException('Campagne niet gevonden.');
    if (campaign.type !== 'social') {
      throw new BadRequestException(
        'Alleen social-campagnes kunnen naar Facebook/Instagram gepubliceerd worden.',
      );
    }

    const { data: content, error: scErr } = await client
      .from('campaign_social_content')
      .select(
        'caption, platforms, hashtags, media_urls, published_at',
      )
      .eq('campaign_id', campaignId)
      .maybeSingle();
    if (scErr) throw new InternalServerErrorException(scErr.message);
    if (!content) {
      throw new BadRequestException('Social-content ontbreekt voor deze campagne.');
    }

    // 2. Idempotent: al gepubliceerd → niet opnieuw posten.
    if (content.published_at) {
      return { published: false, alreadyPublished: true };
    }

    // 3. Berichttekst: caption + hashtags. Gedeeld door alle kanalen.
    const caption = ((content.caption as string | null) ?? '').trim();
    const hashtags = Array.isArray(content.hashtags)
      ? (content.hashtags as string[])
          .map((h) => (h.startsWith('#') ? h : `#${h}`))
          .join(' ')
      : '';
    const message = [caption, hashtags].filter(Boolean).join('\n\n');
    if (!message) {
      throw new BadRequestException('Deze social-campagne heeft nog geen tekst.');
    }
    // Defense-in-depth: een via "Maak eigen campagne" aangemaakt concept houdt
    // de placeholdertekst tot de eigenaar inhoud schrijft/genereert. Nooit de
    // placeholder publiceren — de frontend blokkeert dit al, maar elke
    // publish-pad (detail, bord, cron) moet hier langs.
    if (caption.startsWith('Deze campagne is nog niet uitgewerkt')) {
      throw new BadRequestException(
        'Deze campagne is nog niet uitgewerkt. Schrijf of genereer eerst je tekst.',
      );
    }

    const paths = Array.isArray(content.media_urls)
      ? (content.media_urls as string[])
      : [];

    // 4. Kanaalkeuze. Lege/legacy platforms = generiek "social" → Meta
    //    (Facebook + evt. Instagram). 'tiktok' is een eigen publish-pad.
    const platforms = Array.isArray(content.platforms)
      ? (content.platforms as string[])
      : [];
    const toTikTok = platforms.includes('tiktok');
    // Meta gevraagd als: legacy/leeg (default Meta) óf expliciet FB/IG.
    const metaRequested =
      platforms.length === 0 ||
      platforms.includes('facebook') ||
      platforms.includes('instagram');

    const postIds: Record<string, string> = {};
    const errors: string[] = [];

    // 5. Meta-tak (Facebook/Instagram). Alleen als gevraagd. Geen (volledige)
    //    Meta-koppeling? Dan: is dit een Meta-only campagne → skippen (zoals
    //    vóór deze feature, status flipt naar 'actief'); zit er óók TikTok
    //    in, dan gaan we daar gewoon mee door.
    if (metaRequested) {
      const metaStatus = await this.meta.status(restaurantId, useAdmin);
      if (!metaStatus.connected || !metaStatus.page) {
        if (!toTikTok) {
          return {
            published: false,
            skipped: true,
            reason: metaStatus.connected ? 'no_page' : 'not_connected',
          };
        }
        errors.push(
          metaStatus.connected
            ? 'Geen Meta-pagina gekozen; alleen TikTok geplaatst.'
            : 'Meta niet gekoppeld; alleen TikTok geplaatst.',
        );
      } else {
        // Foto signen (Meta haalt 'm server-side op). IG vereist een foto;
        // een FB-tekstpost mag zonder.
        const imageUrl =
          paths.length > 0
            ? await this.signMediaPath(paths[0], useAdmin).catch(() => undefined)
            : undefined;
        const toFacebook =
          platforms.length === 0 ? true : platforms.includes('facebook');
        const toInstagram =
          platforms.length === 0 ? !!imageUrl : platforms.includes('instagram');
        if (toFacebook || toInstagram) {
          const result = await this.meta.publish(
            restaurantId,
            { message, imageUrl, toFacebook, toInstagram },
            useAdmin,
          );
          if (result.facebook?.id) postIds.facebook = result.facebook.id;
          if (result.instagram?.id) postIds.instagram = result.instagram.id;
          if (result.errors.length) errors.push(...result.errors);
        }
      }
    }

    // 6. TikTok-tak (Direct Post). Vereist een gekoppeld TikTok-account én
    //    een video. De video serveren we publiek op het geverifieerde
    //    web-domein (zie /media/c/:campaignId, fase 3) zodat TikTok 'm via
    //    PULL_FROM_URL kan ophalen. Onaudited/sandbox = alleen SELF_ONLY.
    if (toTikTok) {
      try {
        const ttStatus = await this.tiktok.status(restaurantId, useAdmin);
        const hasVideo = paths.some((p) => /\.(mp4|mov|webm|m4v)$/i.test(p));
        if (!ttStatus.connected) {
          errors.push('TikTok niet gekoppeld; video niet geplaatst.');
        } else if (!hasVideo) {
          errors.push(
            'TikTok vereist een video; deze campagne heeft (nog) geen video.',
          );
        } else {
          const webUrl = (
            process.env.WEB_URL ?? 'https://www.get-filly.com'
          ).replace(/\/$/, '');
          const { publishId } = await this.tiktok.directPost(
            restaurantId,
            {
              videoUrl: `${webUrl}/media/c/${campaignId}`,
              title: message.slice(0, 2200),
              // Sandbox/onaudited: TikTok staat alleen privé toe.
              privacyLevel: 'SELF_ONLY',
            },
            useAdmin,
          );
          postIds.tiktok = publishId;
        }
      } catch (err) {
        errors.push(
          `TikTok-post mislukt: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const anySuccess = Object.keys(postIds).length > 0;

    // 7. Niets gelukt → fout opslaan + naar boven gooien zodat de
    //    activeer-flow de status NIET op 'actief' zet.
    if (!anySuccess) {
      const msg = errors.join(' ') || 'Publiceren mislukt.';
      await client
        .from('campaign_social_content')
        .update({ publish_error: msg, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId);
      throw new BadRequestException(msg);
    }

    // 8. (Deels) gelukt → post-ids + tijd vastleggen; fout-veld bevat een
    //    eventuele deelfout (bv. IG mislukt maar FB gelukt).
    await client
      .from('campaign_social_content')
      .update({
        published_at: new Date().toISOString(),
        published_post_ids: postIds,
        publish_error: errors.length ? errors.join(' ') : null,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId);

    return { published: true, postIds };
  }

  /**
   * ============================================================
   * runScheduledSocial — cron-entry (fase B)
   * ============================================================
   * Publiceert alle social-campagnes waarvan de geplande tijd bereikt
   * is (`ingepland` + `scheduled_for <= nu`). Draait CONTEXT-LOOS (geen
   * ingelogde user), dus alles via de service-role (admin) client.
   *
   * Idempotent op twee niveaus: publishSocialCampaign slaat al-
   * gepubliceerde over (published_at), en we flippen de status naar
   * 'actief' zodat een campagne niet elke run opnieuw wordt opgepakt.
   *
   * Status-afhandeling per campagne:
   *   - gepubliceerd of overgeslagen (geen Meta-koppeling) → 'actief'
   *     (geplande tijd is verstreken; niet eindeloos opnieuw proberen).
   *   - échte publicatiefout (wél gekoppeld) → laat op 'ingepland' staan
   *     zodat de volgende cron-run het opnieuw probeert.
   *
   * LET OP: precieze timing vereist een frequente cron (Vercel Pro,
   * bv. elke 10 min). Op Hobby draait cron max 1×/dag, dus dan posten
   * geplande campagnes pas in dat dagelijkse venster.
   */
  async runScheduledSocial(): Promise<{
    processed: number;
    published: number;
    skipped: number;
    failed: number;
  }> {
    const nowIso = new Date().toISOString();
    const { data: due, error } = await this.admin.client
      .from('campaigns')
      .select('id, restaurant_id')
      .eq('type', 'social')
      .eq('status', 'ingepland')
      .is('deleted_at', null)
      .lte('scheduled_for', nowIso);
    if (error) throw new InternalServerErrorException(error.message);

    let published = 0;
    let skipped = 0;
    let failed = 0;

    for (const c of due ?? []) {
      const restaurantId = c.restaurant_id as string;
      const campaignId = c.id as string;
      try {
        const r = await this.publishSocialCampaign(
          restaurantId,
          campaignId,
          true, // admin-client: geen user-context in de cron
        );
        if (r.published || r.alreadyPublished) published++;
        else skipped++;

        // Geplande tijd is bereikt → status naar 'actief'. Ook bij
        // 'skipped' (geen Meta-koppeling), zodat de campagne niet elke
        // run opnieuw wordt opgepakt. Direct via admin (geen audit/
        // performance-niceties; die hangen aan request-scoped services).
        await this.admin.client
          .from('campaigns')
          .update({
            status: 'actief',
            executed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', campaignId)
          .eq('restaurant_id', restaurantId);
      } catch (err) {
        // Echte publicatiefout (wél gekoppeld): op 'ingepland' laten staan
        // zodat de volgende run het opnieuw probeert. Loggen.
        failed++;
        this.logger.warn(
          `Cron-publiceren faalde voor ${campaignId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { processed: (due ?? []).length, published, skipped, failed };
  }

  async findAll(restaurantId: string): Promise<Campaign[]> {
    // Eerst de campagne-rijen, daarna 2 batch-queries voor de content-
    // tabellen (mail + social). Per type pakken we de juiste snippet
    // en koppelen 'm aan de campaign-id. WhatsApp heeft nog geen
    // content-tabel; daar blijft body_preview null.
    //
    // Per 2026-05-12 (mig 0040): soft-delete via deleted_at. Standaard
    // lijst toont alleen actieve campagnes; verwijderde zijn alleen
    // via findDeleted() te bereiken (Verwijderd-tab in /history).
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select(
        // Per 2026-05-07 fase 4: group_id mee zodat de frontend
        // multi-channel-bundles als één rij kan tonen op /campagnes
        // i.p.v. als losse campagnes.
        'id, name, type, meta, status, result_stats, group_id, scheduled_for',
      )
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as Array<Omit<Campaign, 'body_preview'>>;
    if (rows.length === 0) return [];

    const mailIds = rows.filter((r) => r.type === 'mail').map((r) => r.id);
    const socialIds = rows
      .filter((r) => r.type === 'social')
      .map((r) => r.id);

    const previewMap = new Map<string, string>();
    const truncate = (s: string | null | undefined, max = 140): string | null => {
      if (!s) return null;
      const trimmed = s.replace(/\s+/g, ' ').trim();
      if (!trimmed) return null;
      return trimmed.length > max
        ? trimmed.slice(0, max).trimEnd() + '…'
        : trimmed;
    };

    if (mailIds.length > 0) {
      const { data: mailRows } = await this.supabase.client
        .from('campaign_mail_content')
        .select('campaign_id, body_plain, subject_line')
        .in('campaign_id', mailIds);
      for (const m of mailRows ?? []) {
        const preview = truncate(m.body_plain) ?? truncate(m.subject_line);
        if (preview) previewMap.set(m.campaign_id as string, preview);
      }
    }
    if (socialIds.length > 0) {
      const { data: socialRows } = await this.supabase.client
        .from('campaign_social_content')
        .select('campaign_id, caption')
        .in('campaign_id', socialIds);
      for (const s of socialRows ?? []) {
        const preview = truncate(s.caption);
        if (preview) previewMap.set(s.campaign_id as string, preview);
      }
    }

    return rows.map((r) => ({
      ...r,
      body_preview: previewMap.get(r.id) ?? null,
    })) as Campaign[];
  }

  // Per 2026-05-07 fase 4: bundle-detail ophalen.
  // Per 2026-05-13 (fase C unified-detail-page):
  //   - Retourneert CampaignDetail[] (volledige inhoud + variants +
  //     signed media + reasoning) i.p.v. light Campaign[]. Zo kan de
  //     unified-frontend met 1 call alles tonen zonder N+1-fetches
  //     per kanaal.
  //   - Smart-detect: param mag óók een campaign-id zijn. Dan
  //     resolven we 'm naar zijn group (als die bestaat) of
  //     retourneren we 'm als standalone bundle van 1. Hierdoor kan
  //     de frontend dezelfde URL/route gebruiken voor single- én
  //     multi-channel campagnes.
  //   - group is nullable: null = standalone campagne zonder group.
  async findBundle(
    restaurantId: string,
    idOrGroupId: string,
  ): Promise<{
    group: { id: string; name: string; theme: string | null } | null;
    campaigns: CampaignDetail[];
  }> {
    // Stap 1 — proberen het id als group_id te resolven.
    const { data: groupRow, error: groupErr } = await this.supabase.client
      .from('campaign_groups')
      .select('id, name, theme')
      .eq('id', idOrGroupId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (groupErr) throw new InternalServerErrorException(groupErr.message);

    let resolvedGroupId: string | null = null;
    let groupMeta: {
      id: string;
      name: string;
      theme: string | null;
    } | null = null;

    if (groupRow) {
      resolvedGroupId = groupRow.id as string;
      groupMeta = {
        id: groupRow.id as string,
        name: groupRow.name as string,
        theme: (groupRow.theme as string | null) ?? null,
      };
    } else {
      // Niet gevonden als group — probeer als campaign_id. Als die
      // ook niet bestaat → 404 (de id is nergens van).
      const { data: campRow, error: campRowErr } = await this.supabase.client
        .from('campaigns')
        .select('id, group_id')
        .eq('id', idOrGroupId)
        .eq('restaurant_id', restaurantId)
        .is('deleted_at', null)
        .maybeSingle();
      if (campRowErr)
        throw new InternalServerErrorException(campRowErr.message);
      if (!campRow) {
        throw new BadRequestException('Campagne of bundle niet gevonden.');
      }

      const campGroupId = (campRow.group_id as string | null) ?? null;
      if (campGroupId) {
        // Resolve de group van deze campaign. Als 'm intussen
        // verwijderd is behandelen we 'm als standalone.
        const { data: g } = await this.supabase.client
          .from('campaign_groups')
          .select('id, name, theme')
          .eq('id', campGroupId)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        if (g) {
          resolvedGroupId = g.id as string;
          groupMeta = {
            id: g.id as string,
            name: g.name as string,
            theme: (g.theme as string | null) ?? null,
          };
        }
      }

      // Standalone-pad: campagne hoort bij geen (bestaande) group.
      // Retourneer direct 1 detail; geen tweede round-trip nodig.
      if (!resolvedGroupId) {
        const detail = await this.findById(restaurantId, idOrGroupId);
        return { group: null, campaigns: [detail] };
      }
    }

    // Stap 2 — alle campaign-ids in deze group ophalen.
    const { data: rows, error: rowsErr } = await this.supabase.client
      .from('campaigns')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('group_id', resolvedGroupId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (rowsErr) throw new InternalServerErrorException(rowsErr.message);

    // Stap 3 — per campaign de volledige detail enrichen (parallel).
    // findById doet content + signed media + reasoning. Bundles
    // hebben typisch 1-4 kanalen, parallel is dus geen overload.
    const details = await Promise.all(
      (rows ?? []).map((r) =>
        this.findById(restaurantId, r.id as string),
      ),
    );

    return { group: groupMeta, campaigns: details };
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
    // op signing? Dan tonen we 'm gewoon zonder foto, niet de hele
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

    // Filly's reasoning uit het bijbehorende voorstel ophalen wanneer
    // beschikbaar. Frontend toont 'm op de Concept-detail-pagina als
    // "Waarom dit voorstel"-card, identiek aan de voorstel-detail.
    let reasoning: string | null = null;
    if (campaign.ai_suggestion_id) {
      const { data: suggestion } = await this.supabase.client
        .from('ai_suggestions')
        .select('reasoning')
        .eq('id', campaign.ai_suggestion_id)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (suggestion && typeof suggestion.reasoning === 'string') {
        reasoning = suggestion.reasoning;
      }
    }

    // Aantal verstuurde mails (voor mail-status-label: "Klaar voor
    // verzending" zolang sent_count=0, anders "Verstuurd"). Voor
    // niet-mail-campagnes blijft het altijd 0 — daar is sent geen
    // concept (social/GBP gaan via OAuth-post-flow die we apart loggen).
    //
    // Test-mails (send_mode='test') tellen NIET mee — eigenaar mag
    // onbeperkt testen zonder dat het status-label op 'Verstuurd' springt.
    let sentCount = 0;
    if (campaign.type === 'mail') {
      const { count } = await this.supabase.client
        .from('campaign_sends')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('send_mode', 'all_opted_in');
      sentCount = count ?? 0;
    }

    return {
      ...campaign,
      content: signedContent,
      reasoning,
      sent_count: sentCount,
    } as CampaignDetail;
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
      // Per 2026-05-13 (mig 0041): volledige versies-set incl. de
      // gekozen versie. Wanneer meegegeven hoeven we 'variants' niet
      // post-hoc te backfillen vanuit body/subject. selected_index
      // wijst naar de versie die in campaign_*_content terechtkomt.
      variants?: Array<{ subject_line?: string | null; body: string }>;
      selected_variant_index?: number;
      // Per 2026-05-13: bron-suggestion-id voor de 'Waarom dit voorstel'-
      // join in findById. Zonder deze koppeling toont concept-detail
      // geen reasoning, ook al kwam de campagne uit een approve-call.
      ai_suggestion_id?: string;
      // Sinds 2026-05-04: bij multi-channel-bundle approves geven
      // we een group_id mee zodat alle 3 sub-campagnes onder
      // hetzelfde campaign_groups-anker hangen. Single-channel
      // creates laten 'm null.
      group_id?: string;
      // Voor type='social' campagnes uit een bundle: kanaal-
      // specifieke metadata. platforms vult campaign_social_content.
      // hashtags optioneel (FB heeft er meestal geen, IG wel).
      social_platforms?: string[];
      social_hashtags?: string[];
      // Filly's voorgestelde verzendmoment + 1-zin-redenering uit het
      // voorstel (brein kiest dit per kanaal). Bewaard zodat de
      // "Wanneer plaatsen"-card "Filly stelt voor: … omdat …" kan tonen
      // en afwijking van de eigenaar kan detecteren.
      suggested_scheduled_for?: string | null;
      suggested_scheduled_reasoning?: string | null;
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

    // Per 2026-05-13 (mig 0041): variants is bron-van-waarheid voor
    // de versies-grid. Wanneer caller 'm meegeeft schrijven we 'm
    // direct; anders backfillen we met 1 variant uit body/subject zodat
    // de DB-default (`[]`) niet leeg blijft staan voor nieuwe rijen.
    // Subject_line wordt op `null` genormaliseerd voor niet-mail
    // campagnes om het lezen aan frontend-kant rust te geven.
    const rawVariants = Array.isArray(input.variants)
      ? input.variants
      : [{ subject_line: input.subject_line ?? null, body }];
    const sanitizedVariants = rawVariants
      .filter((v) => typeof v.body === 'string' && v.body.trim().length > 0)
      .map((v) => ({
        subject_line:
          typeof v.subject_line === 'string' && v.subject_line.trim().length > 0
            ? v.subject_line.trim()
            : null,
        body: v.body.trim(),
      }))
      .slice(0, 6);
    // Fallback voor de edge-case 'caller gaf alleen lege variants':
    // we maken 1 entry uit body/subject zodat we nooit met
    // variants=[] eindigen (zou later sync-issues geven).
    const variantsToWrite =
      sanitizedVariants.length > 0
        ? sanitizedVariants
        : [
            {
              subject_line:
                typeof input.subject_line === 'string' &&
                input.subject_line.trim().length > 0
                  ? input.subject_line.trim()
                  : null,
              body,
            },
          ];
    const selectedIdxRaw =
      typeof input.selected_variant_index === 'number'
        ? input.selected_variant_index
        : 0;
    const selectedIdx = Math.min(
      Math.max(selectedIdxRaw, 0),
      variantsToWrite.length - 1,
    );

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
        // Per 2026-05-13 (mig 0041): nieuwe bron-van-waarheid.
        variants: variantsToWrite,
        selected_variant_index: selectedIdx,
        // Bundle-anker (sinds mig 0032). Null voor single-channel.
        group_id: input.group_id ?? null,
        // Per 2026-05-13: koppeling naar het bron-voorstel zodat de
        // detail-page "Waarom dit voorstel"-card kan tonen via de
        // ai_suggestions.reasoning-join.
        ai_suggestion_id: input.ai_suggestion_id ?? null,
        // Filly's voorgestelde verzendmoment + redenering uit het
        // voorstel; voedt de "Wanneer plaatsen"-card (Filly stelt voor +
        // waarom + afwijking-detectie).
        suggested_scheduled_for: input.suggested_scheduled_for ?? null,
        suggested_scheduled_reasoning:
          input.suggested_scheduled_reasoning ?? null,
      })
      .select('id')
      .single();

    if (campErr) throw new InternalServerErrorException(campErr.message);

    const campaignId = campaign.id as string;

    let contentErr: { message: string } | null = null;
    if (input.type === 'mail') {
      // Mail-tabel eist subject_line NOT NULL. Als Filly 'm niet gaf
      // (wat niet zou moeten bij type=mail), vallen we terug op de
      // campagne-naam, beter een zinvol onderwerp dan een DB-fout.
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
          // platforms en hashtags alleen vullen als meegegeven
          // (bundle-flow); anders default uit DB-schema (lege arrays).
          platforms:
            input.social_platforms && input.social_platforms.length > 0
              ? input.social_platforms
              : undefined,
          hashtags:
            input.social_hashtags && input.social_hashtags.length > 0
              ? input.social_hashtags
              : undefined,
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

  // 'Eigen campagne'-builder, multi-channel. Maakt één campaign_groups-
  // anker + per gekozen kanaal een leeg concept onder hetzelfde group_id,
  // zodat de bundel-detailpagina alle kanalen als rijen toont. Bij precies
  // één kanaal slaan we de groep over (losse concept-campagne). Retourneert
  // het id om naartoe te navigeren: het group_id bij meerdere kanalen,
  // anders het campagne-id (findBundle smart-detect resolved beide).
  async createBundle(
    restaurantId: string,
    input: { name: string; platforms: string[] },
    userId: string,
  ): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('Campagne-naam is verplicht.');
    }
    // Dedup met behoud van volgorde.
    const seen = new Set<string>();
    const platforms = input.platforms.filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
    if (platforms.length === 0) {
      throw new BadRequestException('Kies minstens één kanaal.');
    }

    // Eén kanaal → geen bundel, gewoon een losse concept-campagne.
    if (platforms.length === 1) {
      return this.createConceptForPlatform(
        restaurantId,
        name,
        platforms[0],
        userId,
      );
    }

    // Meerdere kanalen → groep-anker + één concept per kanaal.
    const { data: group, error: groupErr } = await this.supabase.client
      .from('campaign_groups')
      .insert({ restaurant_id: restaurantId, name, created_by: userId })
      .select('id')
      .single();
    if (groupErr) throw new InternalServerErrorException(groupErr.message);
    const groupId = group.id as string;

    for (const platform of platforms) {
      await this.createConceptForPlatform(
        restaurantId,
        name,
        platform,
        userId,
        groupId,
      );
    }
    return { id: groupId };
  }

  // Kanaal → campagne-type + (voor social) platform. Maakt een leeg concept
  // met placeholdertekst, optioneel onder een group_id. Gedeeld door het
  // single- en multi-channel builder-pad (dezelfde mapping als de POST-
  // controller, maar hier herbruikbaar voor bundels).
  private async createConceptForPlatform(
    restaurantId: string,
    name: string,
    platform: string,
    userId: string,
    groupId?: string,
  ): Promise<{ id: string }> {
    const CHANNEL_LABEL: Record<string, string> = {
      mail: 'Mail',
      instagram: 'Instagram',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      whatsapp: 'WhatsApp',
      google_business: 'Google Business',
    };
    let type: CampaignType;
    let socialPlatforms: string[] | undefined;
    if (platform === 'mail' || platform === 'whatsapp') {
      type = platform;
    } else if (
      platform === 'instagram' ||
      platform === 'facebook' ||
      platform === 'tiktok' ||
      platform === 'google_business'
    ) {
      type = 'social';
      socialPlatforms = [platform];
    } else {
      throw new BadRequestException('Ongeldig kanaal.');
    }
    // Bij een bundel suffixen we de sub-campagne met het kanaal zodat ze
    // onderscheidbaar zijn; de bundel-titel blijft de groep-naam. Een
    // single-channel concept houdt gewoon de gekozen naam.
    const campaignName = groupId
      ? `${name}, ${CHANNEL_LABEL[platform] ?? platform}`
      : name;
    return this.create(
      restaurantId,
      {
        name: campaignName,
        type,
        subject_line: null,
        body: 'Deze campagne is nog niet uitgewerkt. Klik op Bewerk om je tekst toe te voegen.',
        ...(socialPlatforms ? { social_platforms: socialPlatforms } : {}),
        ...(groupId ? { group_id: groupId } : {}),
      },
      userId,
    );
  }

  // Kanaal toevoegen aan een campagne in concept. Werkt op bundel-niveau:
  // een losse concept-campagne wordt bij het eerste extra kanaal automatisch
  // gepromoveerd tot een bundel (groep + group_id op de bestaande campagne).
  // Maakt een leeg concept voor het nieuwe kanaal onder hetzelfde group_id.
  // Retourneert het group_id zodat de frontend de bundel kan herladen.
  async addChannel(
    restaurantId: string,
    idOrGroupId: string,
    platform: string,
    userId: string,
  ): Promise<{ id: string }> {
    const { groupId, name } = await this.resolveOrCreateGroup(
      restaurantId,
      idOrGroupId,
      userId,
    );
    const existing = await this.platformsInGroup(restaurantId, groupId);
    if (existing.includes(platform)) {
      // Al aanwezig → idempotent.
      return { id: groupId };
    }
    // createConceptForPlatform valideert het platform (BadRequest bij onzin).
    await this.createConceptForPlatform(
      restaurantId,
      name,
      platform,
      userId,
      groupId,
    );
    return { id: groupId };
  }

  // Kanaal verwijderen uit een bundel-concept. Soft-delete't de sub-campagne
  // van dat kanaal (via remove(), dus met de bestaande status-regels +
  // audit). Laat minstens één kanaal staan.
  async removeChannel(
    restaurantId: string,
    idOrGroupId: string,
    platform: string,
    userId: string,
  ): Promise<{ id: string }> {
    const { groupId } = await this.resolveOrCreateGroup(
      restaurantId,
      idOrGroupId,
      userId,
    );
    const members = await this.channelCampaignsInGroup(restaurantId, groupId);
    if (members.length <= 1) {
      throw new BadRequestException(
        'Een campagne moet minstens één kanaal houden.',
      );
    }
    const target = members.find((m) => m.platforms.includes(platform));
    if (!target) {
      // Niet aanwezig → idempotent.
      return { id: groupId };
    }
    await this.remove(restaurantId, target.id, userId);
    return { id: groupId };
  }

  // Resolve idOrGroupId → bestaande groep, of promoveer een losse concept-
  // campagne tot bundel (groep aanmaken + group_id zetten). Alleen toegestaan
  // op een concept. Retourneert group_id + groep-naam (bron voor sub-namen).
  private async resolveOrCreateGroup(
    restaurantId: string,
    idOrGroupId: string,
    userId: string,
  ): Promise<{ groupId: string; name: string }> {
    const client = this.supabase.client;
    const { data: g, error: gErr } = await client
      .from('campaign_groups')
      .select('id, name')
      .eq('id', idOrGroupId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (gErr) throw new InternalServerErrorException(gErr.message);
    if (g) return { groupId: g.id as string, name: g.name as string };

    const { data: camp, error: cErr } = await client
      .from('campaigns')
      .select('id, name, group_id, status')
      .eq('id', idOrGroupId)
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) throw new InternalServerErrorException(cErr.message);
    if (!camp) {
      throw new BadRequestException('Campagne of bundle niet gevonden.');
    }
    if (camp.status !== 'concept') {
      throw new BadRequestException(
        'Kanalen wijzigen kan alleen op een concept.',
      );
    }
    if (camp.group_id) {
      const { data: g2 } = await client
        .from('campaign_groups')
        .select('id, name')
        .eq('id', camp.group_id as string)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (g2) return { groupId: g2.id as string, name: g2.name as string };
    }
    // Promoveer naar bundel: groep aanmaken + group_id op de campagne.
    const { data: newGroup, error: ngErr } = await client
      .from('campaign_groups')
      .insert({
        restaurant_id: restaurantId,
        name: camp.name as string,
        created_by: userId,
      })
      .select('id, name')
      .single();
    if (ngErr) throw new InternalServerErrorException(ngErr.message);
    const { error: upErr } = await client
      .from('campaigns')
      .update({ group_id: newGroup.id as string })
      .eq('id', camp.id as string)
      .eq('restaurant_id', restaurantId);
    if (upErr) throw new InternalServerErrorException(upErr.message);
    return { groupId: newGroup.id as string, name: newGroup.name as string };
  }

  // Kanaal-keys die al in een groep zitten (over alle sub-campagnes heen).
  private async platformsInGroup(
    restaurantId: string,
    groupId: string,
  ): Promise<string[]> {
    const members = await this.channelCampaignsInGroup(restaurantId, groupId);
    return members.flatMap((m) => m.platforms);
  }

  // Per niet-verwijderde campagne in de groep: id + kanaal-keys. mail/whatsapp
  // = het type zelf; social = campaign_social_content.platforms.
  private async channelCampaignsInGroup(
    restaurantId: string,
    groupId: string,
  ): Promise<Array<{ id: string; platforms: string[] }>> {
    const client = this.supabase.client;
    const { data: camps, error } = await client
      .from('campaigns')
      .select('id, type')
      .eq('restaurant_id', restaurantId)
      .eq('group_id', groupId)
      .is('deleted_at', null);
    if (error) throw new InternalServerErrorException(error.message);
    const result: Array<{ id: string; platforms: string[] }> = [];
    for (const c of camps ?? []) {
      const id = c.id as string;
      const type = c.type as string;
      if (type === 'mail') {
        result.push({ id, platforms: ['mail'] });
      } else if (type === 'whatsapp') {
        result.push({ id, platforms: ['whatsapp'] });
      } else if (type === 'social') {
        const { data: sc } = await client
          .from('campaign_social_content')
          .select('platforms')
          .eq('campaign_id', id)
          .maybeSingle();
        const ps = Array.isArray(sc?.platforms)
          ? (sc!.platforms as string[])
          : [];
        result.push({ id, platforms: ps });
      } else {
        result.push({ id, platforms: [] });
      }
    }
    return result;
  }


  // Status-transitie. Levenscyclus met twee bewuste "shortcuts":
  //   concept   → ingepland   (Plan in-knop op /campagnes)
  //   concept   → actief      (▶ Direct activeren — versturen NU)
  //   ingepland → actief      (Activeer-knop)
  //   ingepland → concept     (↩ Terugtrekken vanaf /campagnes)
  //   actief    → afgerond    (Afronden-knop, alle kanalen)
  //   actief    → concept     (Stop + terugtrekken van kanaal, NIET mail)
  //   afgerond  → eindstaat   (geen verdere actie mogelijk)
  // Verwijderen gebeurt apart via remove() en mag op concept of
  // ingepland (zolang de campagne nog niet daadwerkelijk uitgegaan is).
  async updateStatus(
    restaurantId: string,
    id: string,
    nextStatus: CampaignStatus,
    userId: string,
  ): Promise<{ id: string; status: CampaignStatus }> {
    // actief → concept toegevoegd (2026-05-29): een actieve SOCIAL-
    // campagne mag je stoppen + terugtrekken van het kanaal (post
    // verwijderen) en terug naar concept zetten om opnieuw te plannen.
    // Voor mail is dit GEBLOKKEERD (zie type-check hieronder): een
    // verstuurde mail kun je niet terugtrekken.
    const allowed: Record<CampaignStatus, CampaignStatus[]> = {
      concept: ['ingepland', 'actief'],
      ingepland: ['actief', 'concept'],
      actief: ['afgerond', 'concept'],
      afgerond: [],
    };

    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, status, type')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }

    const currentStatus = existing.status as CampaignStatus;
    const campaignType = existing.type as string | null;
    if (!allowed[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Status-transitie van '${currentStatus}' naar '${nextStatus}' is niet toegestaan.`,
      );
    }

    // Mail-campagnes kunnen niet van actief terug naar concept: de mail
    // is al verstuurd en valt niet terug te trekken. Alleen 'afronden'
    // (→ afgerond) is dan toegestaan.
    if (
      currentStatus === 'actief' &&
      nextStatus === 'concept' &&
      campaignType === 'mail'
    ) {
      throw new BadRequestException(
        'Een verstuurde mail-campagne kan niet teruggetrokken worden. Je kunt deze wel afronden.',
      );
    }

    // Social/WhatsApp terugtrekken: verwijder de gepubliceerde post van
    // het kanaal vóór de status-flip. Nu nog een stub (vereist Meta/
    // TikTok OAuth, fase later); zodra die er is wordt hier de echte
    // delete-call gedaan.
    if (currentStatus === 'actief' && nextStatus === 'concept') {
      await this.retractFromChannel(restaurantId, id, campaignType);
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
    // Fail-soft via de service zelf, gebruiker merkt nooit als 'm
    // faalt; alleen logger.warn in de backend.
    if (nextStatus === 'afgerond') {
      await this.anonymization.benchmarkCampaign(id);
    }

    // Bij activatie: zorg dat campaign_performance-rij bestaat zodat
    // alle inkomende webhook-events (delivered/opened/clicked) en
    // attributies een rij vinden om bij te werken. Idempotent.
    // Fire-and-forget; performance-tracking mag de status-flow niet
    // blokkeren.
    if (nextStatus === 'actief') {
      void this.performance
        .ensureRow({ campaignId: id, restaurantId })
        .catch((err) =>
          this.logger.warn(
            `campaign_performance.ensureRow gefaald voor ${id}: ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );
      // Fingerprint-extractie voor anti-repetitie + leerloop. Fail-soft.
      void this.fingerprint.extractFromCampaign(id);
    }

    return { id, status: nextStatus };
  }

  // ============================================================
  // retractFromChannel — gepubliceerde post van het kanaal halen
  // ============================================================
  // Wordt aangeroepen wanneer een ACTIEVE social/WhatsApp-campagne
  // wordt teruggetrokken (actief → concept). Doel: de daadwerkelijk
  // geplaatste post verwijderen bij Instagram/Facebook/TikTok/WhatsApp
  // zodat de campagne niet meer live staat.
  //
  // STATUS: stub. De echte delete-call vereist de Meta Graph API /
  // TikTok API OAuth-koppeling (nog niet live). Tot die er is loggen
  // we de intentie en gaat de status-flip gewoon door — de eigenaar
  // kan de post desnoods handmatig verwijderen. Zodra OAuth er is:
  // hier per platform de delete-endpoint aanroepen met de opgeslagen
  // post-id (die we dan bij publicatie bewaren).
  //
  // Fail-soft: een mislukte kanaal-delete mag de terugtrekking in onze
  // eigen DB niet blokkeren (anders blijft de campagne 'vastzitten' op
  // actief). We loggen een warning.
  private async retractFromChannel(
    restaurantId: string,
    campaignId: string,
    type: string | null,
  ): Promise<void> {
    // Mail komt hier nooit (geblokkeerd in updateStatus), maar dubbel
    // vangen kan geen kwaad.
    if (type === 'mail') return;

    // Alleen social heeft nu een echte koppeling (Meta). WhatsApp/TikTok:
    // nog geen API → alleen loggen, eigenaar verwijdert handmatig.
    if (type !== 'social') {
      this.logger.log(
        `Terugtrekken van ${type ?? 'onbekend'}-kanaal voor ${campaignId} ` +
          `nog niet ondersteund (geen API-koppeling). Verwijder handmatig.`,
      );
      return;
    }

    // Bewaarde post-id's ophalen (gezet bij publiceren).
    const { data: content } = await this.supabase.client
      .from('campaign_social_content')
      .select('published_post_ids')
      .eq('campaign_id', campaignId)
      .maybeSingle();
    const postIds = (content?.published_post_ids ?? null) as {
      facebook?: string;
      instagram?: string;
    } | null;

    // Niets gepubliceerd (of al teruggetrokken) → niets te doen.
    if (!postIds || (!postIds.facebook && !postIds.instagram)) return;

    // Facebook echt verwijderen; Instagram kan niet via de API (handmatig).
    // Fail-soft: een mislukte kanaal-delete mag de terugtrekking in onze
    // eigen DB niet blokkeren (anders blijft de campagne op 'actief' hangen).
    const res = await this.meta
      .retract(restaurantId, {
        facebook: postIds.facebook ?? null,
        instagram: postIds.instagram ?? null,
      })
      .catch((err) => {
        this.logger.warn(
          `Meta-retract faalde voor ${campaignId}: ${String(err)}`,
        );
        return null;
      });

    if (res?.instagramManual) {
      this.logger.log(
        `Campagne ${campaignId}: Instagram-post kan niet via de API worden ` +
          `verwijderd — eigenaar moet 'm handmatig in de IG-app verwijderen.`,
      );
    }

    // Publicatiestaat wissen zodat de campagne niet meer als 'gepubliceerd'
    // geldt en bij her-activeren opnieuw geplaatst kan worden.
    await this.supabase.client
      .from('campaign_social_content')
      .update({
        published_at: null,
        published_post_ids: null,
        publish_error: res?.instagramManual
          ? 'Instagram-post handmatig verwijderen (kan niet via de API).'
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId);
  }

  // ============================================================
  // restoreFromHistory — campagne uit historie terughalen
  // ============================================================
  // Per 2026-05-21 (Floris-feedback): eigenaar moet een afgeronde
  // OF verstreken-niet-afgeronde campagne kunnen terugzetten naar
  // concept/ingepland/actief, MET een nieuwe datum die in de
  // toekomst ligt.
  //
  // Verschilt van updateStatus (die werkt op transitie-tabel) op
  // twee punten:
  //   1. Bron-status mag 'afgerond' zijn of een willekeurige status
  //      met scheduled_for < nu (= 'effectief verlopen').
  //   2. scheduled_for wordt ALTIJD opnieuw gezet (verplicht), niet
  //      optioneel zoals bij setSchedule.
  //
  // executed_at wordt expliciet op null gezet — anders denkt de
  // backend later dat de campagne al een keer is afgevuurd, wat
  // verwarring geeft in stats + retentie-analyse.
  async restoreFromHistory(
    restaurantId: string,
    id: string,
    nextStatus: 'concept' | 'ingepland' | 'actief',
    scheduledFor: string,
    userId: string,
  ): Promise<{ id: string; status: CampaignStatus }> {
    // Valideer status (overbodig met TS-typing, maar verdedigend
    // voor de Body-payload die als string binnenkomt).
    if (
      nextStatus !== 'concept' &&
      nextStatus !== 'ingepland' &&
      nextStatus !== 'actief'
    ) {
      throw new BadRequestException(
        'Ongeldige status. Gebruik concept, ingepland of actief.',
      );
    }

    // Valideer datum — moet parsebaar zijn EN in de toekomst.
    // We accepteren een marge van 60 sec (zodat de eigenaar op
    // 17:00:00 klikt voor 17:00 vandaag en de submit-roundtrip
    // niet alsnog op 'verleden' uitkomt).
    const newSched = new Date(scheduledFor);
    if (Number.isNaN(newSched.getTime())) {
      throw new BadRequestException('Ongeldige datum-waarde.');
    }
    const minFuture = Date.now() - 60 * 1000;
    if (newSched.getTime() < minFuture) {
      throw new BadRequestException(
        'Nieuwe datum moet in de toekomst liggen.',
      );
    }

    // Haal de campagne op + verifieer dat hij in de historie hoort.
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, status, scheduled_for, deleted_at')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (existing.deleted_at) {
      throw new BadRequestException(
        'Verwijderde campagnes kunnen niet via deze flow teruggezet worden.',
      );
    }

    // "In de historie" = status='afgerond' OF verstreken (scheduled_for
    // < nu, ongeacht status). Anders zou eigenaar een lopende campagne
    // via deze endpoint kunnen "resetten" — niet de bedoeling.
    const isAfgerond = existing.status === 'afgerond';
    const nowIso = new Date().toISOString();
    const isExpired =
      typeof existing.scheduled_for === 'string' &&
      existing.scheduled_for < nowIso;
    if (!isAfgerond && !isExpired) {
      throw new BadRequestException(
        'Deze campagne staat niet in de historie. Gebruik de gewone status-acties op /campagnes.',
      );
    }

    const previousStatus = existing.status as CampaignStatus;
    const previousSchedule = existing.scheduled_for;

    const updates: Record<string, unknown> = {
      status: nextStatus,
      scheduled_for: newSched.toISOString(),
      // Reset executed_at zodat retentie-stats + benchmarks niet
      // doen alsof de campagne al gedraaid heeft.
      executed_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    // Audit: wie heeft een historie-campagne weer actief gemaakt?
    // Verwarring later voorkomen ("dachten dat 'ie al klaar was").
    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_restored_from_history',
      entity_type: 'campaign',
      entity_id: id,
      payload: {
        from_status: previousStatus,
        to_status: nextStatus,
        old_scheduled_for: previousSchedule,
        new_scheduled_for: newSched.toISOString(),
      },
    });

    return { id, status: nextStatus };
  }


  // ============================================================
  // VARIANT-OPERATIES (mig 0041 — nieuwe bron-van-waarheid)
  // ============================================================
  // Drie methodes voor de unified-detail-page:
  //   selectVariant(idx)     — flip selected_variant_index + sync content
  //   editVariant(idx, …)    — wijzig één entry, sync content als idx=selected
  //   generateMoreVariants() — Claude levert 3 nieuwe, append tot max 6

  // Helper: sync campaign_*_content uit variants[selectedIdx]. Wordt
  // gebruikt na elke selectVariant + na editVariant op de geselecteerde
  // entry. Houdt de "afgeleide" body/subject in de content-tabel in
  // lijn met de bron-van-waarheid op campaigns.variants[].
  private async syncContentFromVariant(
    id: string,
    type: 'mail' | 'social' | 'whatsapp',
    variant: CampaignVariant,
  ): Promise<void> {
    const now = new Date().toISOString();
    if (type === 'mail') {
      // Mail.subject_line is NOT NULL in DB: lege subject vallen we
      // terug op de campagne-naam om DB-constraint-fout te voorkomen.
      // Dat is vrijwel altijd ondergeschikt (concept-fase, eigenaar
      // bewerkt 't toch nog).
      const { data: existingName } = await this.supabase.client
        .from('campaigns')
        .select('name')
        .eq('id', id)
        .maybeSingle();
      const fallback =
        existingName?.name && typeof existingName.name === 'string'
          ? (existingName.name as string)
          : 'Concept';
      const { error } = await this.supabase.client
        .from('campaign_mail_content')
        .update({
          subject_line: variant.subject_line ?? fallback,
          body_plain: variant.body,
          updated_at: now,
        })
        .eq('campaign_id', id);
      if (error) throw new InternalServerErrorException(error.message);
    } else if (type === 'social') {
      const { error } = await this.supabase.client
        .from('campaign_social_content')
        .update({ caption: variant.body, updated_at: now })
        .eq('campaign_id', id);
      if (error) throw new InternalServerErrorException(error.message);
    } else {
      const { error } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .update({ message_text: variant.body, updated_at: now })
        .eq('campaign_id', id);
      if (error) throw new InternalServerErrorException(error.message);
    }
  }

  // selectVariant — eigenaar klikt op een andere "Versie N"-card.
  // We flippen selected_variant_index én syncen de campaign_*_content
  // zodat downstream-systemen (e-mail-send, social-publish) altijd
  // werken met de geselecteerde tekst. Alleen toegestaan op concept;
  // immutable na ingepland.
  async selectVariant(
    restaurantId: string,
    id: string,
    index: number,
    userId: string,
  ): Promise<{ id: string; selected_variant_index: number }> {
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Variant-index moet >= 0 zijn.');
    }
    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, variants, selected_variant_index')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (existing.status !== 'concept') {
      throw new BadRequestException(
        `Versie wisselen kan alleen bij concept-campagnes (deze is ${existing.status}).`,
      );
    }
    const variants = Array.isArray(existing.variants)
      ? (existing.variants as CampaignVariant[])
      : [];
    if (index >= variants.length) {
      throw new BadRequestException(
        `Variant-index ${index} buiten bereik (${variants.length} versies).`,
      );
    }
    // Idempotent: dezelfde index opnieuw kiezen is geen fout, voorkomt
    // race-condities waarin een dubbel-klik 2 audit-entries oplevert.
    if (existing.selected_variant_index === index) {
      return { id, selected_variant_index: index };
    }

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        selected_variant_index: index,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    await this.syncContentFromVariant(
      id,
      existing.type as 'mail' | 'social' | 'whatsapp',
      variants[index],
    );

    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_variant_selected',
      entity_type: 'campaign',
      entity_id: id,
      payload: { from: existing.selected_variant_index, to: index },
    });

    return { id, selected_variant_index: index };
  }

  // editVariant — eigenaar bewerkt een specifieke versie. Update
  // variants[idx] in place. Als idx==selected_variant_index syncen
  // we ook de content-tabel zodat de "Gekozen" versie matched.
  async editVariant(
    restaurantId: string,
    id: string,
    index: number,
    patch: { subject_line?: string | null; body?: string },
    userId: string,
  ): Promise<{ id: string; variants: CampaignVariant[] }> {
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Variant-index moet >= 0 zijn.');
    }
    if (typeof patch.body !== 'string' || patch.body.trim().length === 0) {
      throw new BadRequestException('Body mag niet leeg zijn.');
    }
    // Subject_line beperken op 200 zoals refine() doet — zelfde DB-
    // veiligheid, zelfde mail-norm.
    if (
      typeof patch.subject_line === 'string' &&
      patch.subject_line.length > 200
    ) {
      throw new BadRequestException(
        'Onderwerp mag maximaal 200 tekens zijn.',
      );
    }

    const { data: existing, error: fetchErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, variants, selected_variant_index')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (existing.status !== 'concept') {
      throw new BadRequestException(
        `Versie bewerken kan alleen bij concept-campagnes (deze is ${existing.status}).`,
      );
    }
    const variants = Array.isArray(existing.variants)
      ? (existing.variants as CampaignVariant[])
      : [];
    if (index >= variants.length) {
      throw new BadRequestException(
        `Variant-index ${index} buiten bereik (${variants.length} versies).`,
      );
    }

    // Patch in place: behoud bestaande velden tenzij overschreven.
    const updated: CampaignVariant = {
      body: patch.body.trim(),
      subject_line:
        patch.subject_line === null
          ? null
          : typeof patch.subject_line === 'string' &&
              patch.subject_line.trim().length > 0
            ? patch.subject_line.trim()
            : (variants[index].subject_line ?? null),
    };
    const newVariants = variants.map((v, i) => (i === index ? updated : v));

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        variants: newVariants,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    // Alleen content-tabel syncen als de bewerkte entry óók de
    // geselecteerde is — anders is dit een "stille" alternatief-edit
    // die de huidige tekst niet raakt.
    if (existing.selected_variant_index === index) {
      await this.syncContentFromVariant(
        id,
        existing.type as 'mail' | 'social' | 'whatsapp',
        updated,
      );
    }

    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_variant_edited',
      entity_type: 'campaign',
      entity_id: id,
      payload: { index, was_selected: existing.selected_variant_index === index },
    });

    return { id, variants: newVariants };
  }

  // generateMoreVariants — Filly genereert 3 nieuwe versies en hangt
  // ze achter de bestaande aan. Cap op 6 totaal (zelfde grens als
  // refine()). Optionele instructie stuurt de stijl. Werkt vanuit
  // de huidige Gekozen-versie als basis.
  async generateMoreVariants(
    restaurantId: string,
    id: string,
    instruction: string | undefined,
  ): Promise<{ id: string; variants: CampaignVariant[] }> {
    const trimmedInstruction =
      typeof instruction === 'string' ? instruction.trim() : '';
    if (trimmedInstruction.length > 1000) {
      throw new BadRequestException(
        'Instructie mag maximaal 1000 tekens zijn.',
      );
    }

    const { data: campaign, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id, type, status, name, variants, selected_variant_index')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();
    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (campaign.status !== 'concept') {
      throw new BadRequestException(
        `Nieuwe versies genereren kan alleen bij concept-campagnes (deze is ${campaign.status}).`,
      );
    }
    const existingVariants = Array.isArray(campaign.variants)
      ? (campaign.variants as CampaignVariant[])
      : [];
    if (existingVariants.length >= 6) {
      throw new BadRequestException(
        'Maximum aantal versies bereikt (6). Bewerk een bestaande versie of verwijder er een.',
      );
    }

    // Huidige (Gekozen) versie als 'huidige snapshot' voor Filly's prompt.
    const selectedIdx = Math.min(
      Math.max(campaign.selected_variant_index ?? 0, 0),
      Math.max(existingVariants.length - 1, 0),
    );
    const current = existingVariants[selectedIdx] ?? {
      body: '',
      subject_line: null,
    };

    const type = campaign.type as 'mail' | 'social' | 'whatsapp';

    // Kanaal-regels uit het centrale brein, zelfde aanpak als refine().
    // De platforms-kolom leeft in campaign_social_content; één lichte
    // query alleen wanneer dit een social-campagne is.
    let socialPlatform: string | null = null;
    if (type === 'social') {
      const { data: social } = await this.supabase.client
        .from('campaign_social_content')
        .select('platforms')
        .eq('campaign_id', id)
        .maybeSingle();
      socialPlatform = (social?.platforms as string[] | null)?.[0] ?? null;
    }
    const channel = mapCampaignTypeToChannel(type, socialPlatform);
    const channelRules = formatChannelRulesForPrompt(channel);

    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    const systemPrompt = `Je bent Filly, een AI-assistent voor het hieronder beschreven restaurant. Je krijgt een bestaande campagne en moet 3 alternatieve versies bedenken die specifiek bij DEZE onderneming passen.

Je antwoord komt via de tool 'generate_campaign_variants'. Vul het schema met precies 3 alternatieven.

Inhoudsregels:
- Maak de 3 varianten écht verschillend in toon/insteek
  (bv. v1 = warm-uitnodigend, v2 = zakelijk-direct, v3 = speels-kort).
- Houd élke variant binnen de lengte-bandbreedte uit KANAAL-REGELS
  hieronder. Varieer in lengte binnen die bandbreedte, nooit erbuiten.
- Behoud de kern van de boodschap (datum, aanbod, USP) tenzij de
  instructie expliciet vraagt om iets te wijzigen.
- Verwerk concrete elementen uit het profiel (USPs, doelgroep, sfeer)
  en menu (echte gerechten + prijzen).
- Refereer ALLEEN aan menu-items die letterlijk in MENU staan.
- subject_line alleen voor mail-campagnes.
- Schrijf in het Nederlands.

---
KANAAL-REGELS (deze campagne is type '${type}' → kanaal '${channel}'):

${channelRules}
---
CONTEXT, alles wat je weet over deze onderneming:

${profileBlock}

${menuBlock}
---`;

    const currentBody = (current.body ?? '').trim();
    // Een zelf-aangemaakte campagne (via "Maak eigen campagne") start met een
    // placeholdertekst en heeft dus nog geen echte inhoud om alternatieven van
    // af te leiden. In dat geval laten we Filly 3 EERSTE versies schrijven op
    // basis van naam + context, i.p.v. "alternatieven van de placeholder"
    // (dat leverde lege/onbruikbare output → fout bij genereren).
    const hasRealContent =
      currentBody.length > 0 &&
      !currentBody.startsWith('Deze campagne is nog niet uitgewerkt');

    const currentSnapshot = {
      name: campaign.name as string,
      type,
      ...(current.subject_line ? { subject_line: current.subject_line } : {}),
      body: currentBody,
    };
    let userPrompt: string;
    if (!hasRealContent) {
      userPrompt = `Deze campagne ("${campaign.name as string}") heeft nog geen uitgewerkte tekst. Schrijf 3 eerste versies in verschillende tonen (warm-uitnodigend, zakelijk-direct, speels-kort), volledig gebaseerd op de CONTEXT (profiel + menu) hierboven en de KANAAL-REGELS. Kies zelf een passend, concreet aanbod dat bij deze onderneming past.${
        trimmedInstruction
          ? `\n\nInstructie van de eigenaar:\n${trimmedInstruction}`
          : ''
      }`;
    } else if (trimmedInstruction) {
      userPrompt = `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nInstructie van de eigenaar:\n${trimmedInstruction}\n\nGeef 3 alternatieve versies.`;
    } else {
      userPrompt = `Huidige campagne:\n${JSON.stringify(currentSnapshot, null, 2)}\n\nGeef 3 alternatieve versies in verschillende tonen (warm, zakelijk, speels).`;
    }

    const generateVariants = (prompt: string) =>
      this.ai.generateStructured<CampaignVariantsFromTool>({
        system: systemPrompt,
        prompt,
        model: 'claude-sonnet-4-6',
        maxTokens: 3000,
        toolName: 'generate_campaign_variants',
        toolDescription:
          'Lever precies 3 alternatieve campagne-varianten in verschillende tonen op basis van de huidige versie en (optionele) instructie.',
        inputSchema: CAMPAIGN_VARIANTS_SCHEMA,
        meta: { restaurantId, feature: 'campaign_variants_more' },
        cacheSystem: true,
      });

    // Zelfde lengte-guard als refine(): één gerichte herschrijf bij
    // varianten buiten de kanaal-bandbreedte, daarna beste resultaat.
    const parsed = await enforceCopyLength({
      channel,
      first: await generateVariants(userPrompt),
      // Defensief: een onvolledige/onverwachte tool-output (geen variants-
      // array of een variant zonder body) mag nooit een ruwe TypeError →
      // generieke 500 worden. Lege strings vallen verderop weg.
      getBodies: (r) =>
        (Array.isArray(r?.variants) ? r.variants : []).map((v) =>
          typeof v?.body === 'string' ? v.body : '',
        ),
      regenerate: (instruction) =>
        generateVariants(`${userPrompt}\n\n${instruction}`),
      logger: this.logger,
      feature: 'campaign_variants_more',
    });

    // Parse + sanitize zelfde regels als refine(). Guard tegen een
    // ontbrekende variants-array zodat we een nette melding geven i.p.v.
    // een onafgevangen fout.
    const parsedVariants = Array.isArray(parsed?.variants)
      ? parsed.variants
      : [];
    const fresh: CampaignVariant[] = [];
    for (const v of parsedVariants) {
      const body = typeof v?.body === 'string' ? v.body.trim() : '';
      if (!body) continue;
      const variant: CampaignVariant = { body, subject_line: null };
      if (v.subject_line && v.subject_line.trim().length > 0) {
        variant.subject_line = v.subject_line.trim().slice(0, 200);
      }
      fresh.push(variant);
    }
    if (fresh.length === 0) {
      this.logger.error(
        `[campaign_variants_more] geen bruikbare versies; ruwe AI-output: ${JSON.stringify(
          parsed,
        )}`,
      );
      throw new InternalServerErrorException(
        'Filly leverde geen bruikbare versies. Probeer het opnieuw of geef een specifiekere instructie.',
      );
    }

    const newAll = [...existingVariants, ...fresh].slice(0, 6);

    const { error: updErr } = await this.supabase.client
      .from('campaigns')
      .update({
        variants: newAll,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    return { id, variants: newAll };
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
    const mime = file.mimeType.toLowerCase();
    const allowedImage = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    // Video (mp4/mov/webm) sinds 2026-06-22 voor TikTok-campagnes. TikTok
    // vereist een video; FB/IG accepteren ook video.
    const allowedVideo = new Set([
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);
    const isVideo = allowedVideo.has(mime);
    if (!allowedImage.has(mime) && !isVideo) {
      throw new BadRequestException(
        `Bestandstype ${file.mimeType} wordt niet ondersteund. Upload JPG, PNG, WebP, GIF of een video (MP4, MOV, WebM).`,
      );
    }
    // Video mag groter zijn dan een foto (TikTok-clips); foto blijft 10MB.
    const MAX_BYTES = (isVideo ? 50 : 10) * 1024 * 1024;
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Bestand is te groot (${Math.round(file.buffer.length / 1024 / 1024)}MB). Maximaal ${isVideo ? 50 : 10}MB.`,
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
    // niet waardevol, we willen path-traversal voorkomen.
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

  // Set de definitieve scheduled_for voor een concept-campagne.
  // Wordt aangeroepen wanneer eigenaar het Filly-voorstel accepteert
  // óf zelf een tijdstip kiest. Geen status-transitie hier, die
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

  // Helper: maak signed URL voor 1 storage-pad. 1 uur geldig, past
  // bij dashboard-sessie-duur. Voor verzend-API's straks een verse
  // URL genereren met langere expiry.
  async signMediaPath(path: string, useAdmin = false): Promise<string> {
    const client = useAdmin ? this.admin.client : this.supabase.client;
    const { data, error } = await client.storage
      .from('campaign-media')
      .createSignedUrl(path, 60 * 60);
    if (error) throw new InternalServerErrorException(error.message);
    return data.signedUrl;
  }

  // ============================================================
  // getTikTokVideoSignedUrl — publieke video-serving voor PULL_FROM_URL
  // ============================================================
  // TikTok haalt de video via PULL_FROM_URL op van het geverifieerde
  // web-domein (get-filly.com/media/c/:campaignId). Die web-route streamt
  // de video door via dit endpoint: we zoeken de eerste video in de
  // social-content-media van de campagne en geven er een (korte) signed
  // URL voor terug. Admin-client want de aanroep is context-loos (geen
  // ingelogde user — TikTok/de web-route roept 'm aan). Null = geen video.
  async getTikTokVideoSignedUrl(campaignId: string): Promise<string | null> {
    const { data, error } = await this.admin.client
      .from('campaign_social_content')
      .select('media_urls')
      .eq('campaign_id', campaignId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const paths = Array.isArray(data?.media_urls)
      ? (data.media_urls as string[])
      : [];
    const videoPath = paths.find((p) => /\.(mp4|mov|webm|m4v)$/i.test(p));
    if (!videoPath) return null;
    return this.signMediaPath(videoPath, true);
  }

  // Hard delete. Toegestaan voor concept én ingepland, een ingeplande
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
      .select('id, status, deleted_at')
      .eq('restaurant_id', restaurantId)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!existing) {
      throw new BadRequestException('Campagne niet gevonden.');
    }
    if (existing.deleted_at) {
      // Idempotent: al verwijderd → success, geen 4xx.
      return { id };
    }
    if (existing.status !== 'concept' && existing.status !== 'ingepland') {
      throw new BadRequestException(
        `Alleen concept- of ingeplande campagnes zijn te verwijderen (deze is ${existing.status}).`,
      );
    }

    // Per 2026-05-12 (mig 0040): soft-delete via deleted_at. De rij
    // blijft staan zodat eigenaar 'm terugvindt in /campagnes/history
    // → Verwijderd-tab. Content-tabellen + recipients blijven daardoor
    // ook bestaan (geen cascade-effect bij UPDATE).
    const { error: delErr } = await this.supabase.client
      .from('campaigns')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId);
    if (delErr) throw new InternalServerErrorException(delErr.message);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_deleted',
      entity_type: 'campaign',
      entity_id: id,
      payload: { previous_status: existing.status, soft: true },
    });

    return { id };
  }

  // Verwijderde campagnes voor de Verwijderd-tab op /campagnes/history.
  // Zelfde shape als findAll, maar gefilterd op deleted_at IS NOT NULL.
  // Geen body_preview-join: voor de archief-view voldoet de naam + datum.
  async findDeleted(restaurantId: string): Promise<Campaign[]> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select(
        'id, name, type, meta, status, result_stats, group_id, scheduled_for, deleted_at',
      )
      .eq('restaurant_id', restaurantId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((r) => ({
      ...r,
      body_preview: null,
    })) as Campaign[];
  }
}
