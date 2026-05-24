import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import {
  type FillyChannel,
  type CtaTemplate,
  type ToneSignature,
} from '../ai/filly-brain.config';

/**
 * ============================================================
 * CampaignFingerprintService — stilistische metadata per campagne
 * ============================================================
 *
 * Per filly-brein hoofdstuk 8 + 9.5:
 *
 * 1. Extractie: zodra een campagne `actief` wordt, bouwt deze service
 *    een 'fingerprint' (opening / hashtags / cta-template / theme /
 *    primary_dish / tone_signature) en slaat 'm op in
 *    campaign_style_fingerprints.
 *
 * 2. Anti-repetitie-context: de laatste N fingerprints voor een
 *    restaurant+kanaal worden door chat.service / suggestions.service
 *    in de system-prompt geplakt als "VERMIJD herhaling van...".
 *
 * 3. Leerloop-context: top-3 winners + top-3 underperformers (JOIN
 *    met campaign_performance) worden geplakt als "SUCCESSFUL
 *    PATTERNS" / "AVOID THESE PATTERNS".
 *
 * V1: heuristische extractor (geen LLM-call) voor opening, hashtags,
 * cta. tone_signature blijft null tot v2 (Claude-classifier).
 * primary_dish_mentioned: matched tegen menu-items.
 * ============================================================
 */

export interface Fingerprint {
  id: string;
  campaign_id: string;
  channel: FillyChannel;
  opening_pattern: string | null;
  hashtag_set: string[] | null;
  cta_template: CtaTemplate | null;
  theme: string | null;
  primary_dish_mentioned: string | null;
  tone_signature: ToneSignature | null;
  created_at: string;
}

@Injectable()
export class CampaignFingerprintService {
  private readonly logger = new Logger(CampaignFingerprintService.name);

  constructor(
    private readonly serviceSupabase: SupabaseService,
    private readonly requestSupabase: RequestSupabaseService,
  ) {}

  // ============================================================
  // 1. Extractie bij campagne-approve
  // ============================================================

  /**
   * Lees campagne + content + restaurant-menu, bouw fingerprint en
   * schrijf weg. Idempotent dankzij UNIQUE-constraint op campaign_id.
   * Fail-soft: een fout mag de approve-flow niet blokkeren.
   */
  async extractFromCampaign(campaignId: string): Promise<void> {
    try {
      // 1) Campagne ophalen + content (mail- of social-tabel).
      const { data: campaign } = await this.serviceSupabase.client
        .from('campaigns')
        .select(
          'id, restaurant_id, type, name, campaign_mail_content(subject_line, body_html, body_plain), campaign_social_content(platform, caption, hashtags)',
        )
        .eq('id', campaignId)
        .maybeSingle();

      if (!campaign) {
        this.logger.warn(
          `extractFromCampaign: campagne ${campaignId} niet gevonden`,
        );
        return;
      }

      // 2) Restaurant-menu voor primary_dish-match.
      const { data: menu } = await this.serviceSupabase.client
        .from('menu_items')
        .select('name')
        .eq('restaurant_id', (campaign as { restaurant_id: string }).restaurant_id);

      const menuNames = (menu ?? []).map(
        (m) => (m as { name: string }).name,
      );

      // 3) Bepaal kanaal + ruwe body-text voor extractie.
      const channel: FillyChannel = this.deriveChannel(campaign);
      const body = this.deriveBodyText(campaign);
      const hashtagsRaw = this.deriveHashtags(campaign);

      // 4) Heuristieken toepassen.
      const opening = this.extractOpening(body);
      const cta = this.classifyCta(body);
      const primaryDish = this.matchPrimaryDish(body, menuNames);

      // 5) Insert (idempotent via UNIQUE op campaign_id).
      const { error } = await this.serviceSupabase.client
        .from('campaign_style_fingerprints')
        .upsert(
          {
            campaign_id: campaignId,
            restaurant_id: (campaign as { restaurant_id: string }).restaurant_id,
            channel,
            opening_pattern: opening,
            hashtag_set: hashtagsRaw,
            cta_template: cta,
            theme: null, // wordt in v2 uit suggestion.trigger_type afgeleid
            primary_dish_mentioned: primaryDish,
            tone_signature: null, // v2: Claude-classifier
            extractor_version: 'v1',
          },
          { onConflict: 'campaign_id' },
        );

      if (error) {
        this.logger.warn(
          `Fingerprint-upsert gefaald voor ${campaignId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `extractFromCampaign crashte voor ${campaignId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  // ============================================================
  // 2. Lezers (voor chat + suggestions prompt-injectie)
  // ============================================================

  /**
   * Laatste N fingerprints voor anti-repetitie-context. Gebruikt
   * door chat.service vóór generation om "vermijd dit"-blok te bouwen.
   */
  async getRecentFingerprints(
    restaurantId: string,
    channel: FillyChannel,
    limit = 10,
  ): Promise<Fingerprint[]> {
    const { data, error } = await this.requestSupabase.client
      .from('campaign_style_fingerprints')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      this.logger.warn(`getRecentFingerprints: ${error.message}`);
      return [];
    }
    return (data ?? []) as Fingerprint[];
  }

  /**
   * Fingerprints van top-N 'winner'-campagnes (JOIN met
   * campaign_performance.classification). Outliers worden geëxcludeerd.
   * Voor Filly's "SUCCESSFUL PATTERNS"-blok in de system-prompt.
   */
  async getWinnerFingerprints(
    restaurantId: string,
    channel: FillyChannel,
    limit = 3,
  ): Promise<Fingerprint[]> {
    return this.getClassifiedFingerprints(
      restaurantId,
      channel,
      'winner',
      'desc',
      limit,
    );
  }

  async getUnderperformerFingerprints(
    restaurantId: string,
    channel: FillyChannel,
    limit = 3,
  ): Promise<Fingerprint[]> {
    return this.getClassifiedFingerprints(
      restaurantId,
      channel,
      'underperformer',
      'asc',
      limit,
    );
  }

  /**
   * Helper: JOIN fingerprints + performance-classification, sorteer op
   * success_score, returnt fingerprints. Skipt outliers.
   */
  private async getClassifiedFingerprints(
    restaurantId: string,
    channel: FillyChannel,
    classification: 'winner' | 'underperformer',
    order: 'asc' | 'desc',
    limit: number,
  ): Promise<Fingerprint[]> {
    // PostgREST-embed via FK om de JOIN te doen. Filter op
    // performance.classification én skip outliers.
    const { data, error } = await this.requestSupabase.client
      .from('campaign_style_fingerprints')
      .select(
        '*, campaign_performance!campaign_id(success_score, classification, marked_outlier)',
      )
      .eq('restaurant_id', restaurantId)
      .eq('channel', channel)
      .limit(50); // ruimer ophalen, filteren we client-side

    if (error) {
      this.logger.warn(
        `getClassifiedFingerprints (${classification}): ${error.message}`,
      );
      return [];
    }

    // Filter op classification + non-outlier; sorteer op score.
    type RowWithPerf = Fingerprint & {
      campaign_performance: {
        success_score: number | null;
        classification: string | null;
        marked_outlier: boolean;
      } | Array<{
        success_score: number | null;
        classification: string | null;
        marked_outlier: boolean;
      }>;
    };

    const filtered = (data ?? [])
      .map((r) => r as unknown as RowWithPerf)
      .map((r) => ({
        fp: r as unknown as Fingerprint,
        perf: Array.isArray(r.campaign_performance)
          ? r.campaign_performance[0]
          : r.campaign_performance,
      }))
      .filter(
        (x) =>
          x.perf &&
          x.perf.classification === classification &&
          !x.perf.marked_outlier &&
          x.perf.success_score !== null,
      )
      .sort((a, b) => {
        const sa = a.perf!.success_score ?? 0;
        const sb = b.perf!.success_score ?? 0;
        return order === 'desc' ? sb - sa : sa - sb;
      })
      .slice(0, limit)
      .map((x) => x.fp);

    return filtered;
  }

  // ============================================================
  // 3. Format-helpers voor system-prompt-injectie
  // ============================================================

  /**
   * Format een lijst fingerprints als plain-text blok voor in de
   * system-prompt. Wordt door chat.service / suggestions.service
   * onder een header geplaatst zoals "SUCCESSFUL PATTERNS, gebruik
   * deze als inspiratie:" of "AVOID THESE PATTERNS:".
   */
  /**
   * Bouwt het complete leer-loop-blok voor injectie in Filly's
   * system-prompt: top-3 winners (als inspiratie) + top-3 underperformers
   * (als waarschuwing) over een set kanalen. Returnt lege string
   * wanneer er geen geclassificeerde campagnes zijn — Filly werkt
   * dan op industry-benchmarks alleen.
   *
   * Default-kanalen zijn de drie hoogste-frequentie kanalen voor
   * horeca (mail/IG-feed/FB). Caller mag een eigen subset doorgeven
   * wanneer er al bekend is op welk kanaal Filly gaat genereren.
   */
  async buildLearningContextBlock(
    restaurantId: string,
    channels: FillyChannel[] = ['mail', 'instagram_feed', 'facebook'],
  ): Promise<string> {
    const winnersByChannel: Record<string, Fingerprint[]> = {};
    const underByChannel: Record<string, Fingerprint[]> = {};

    // Per kanaal parallel laden om latency laag te houden.
    await Promise.all(
      channels.flatMap((c) => [
        this.getWinnerFingerprints(restaurantId, c, 3).then((fps) => {
          winnersByChannel[c] = fps;
        }),
        this.getUnderperformerFingerprints(restaurantId, c, 3).then((fps) => {
          underByChannel[c] = fps;
        }),
      ]),
    );

    const allWinners = Object.values(winnersByChannel).flat();
    const allUnder = Object.values(underByChannel).flat();

    if (allWinners.length === 0 && allUnder.length === 0) {
      return '';
    }

    const parts: string[] = [];
    if (allWinners.length > 0) {
      parts.push(
        this.formatFingerprintsForPrompt(
          allWinners,
          'SUCCESSFUL PATTERNS (Winners — gebruik als inspiratie, kopieer NIET letterlijk)',
        ),
      );
    }
    if (allUnder.length > 0) {
      parts.push(
        this.formatFingerprintsForPrompt(
          allUnder,
          'AVOID THESE PATTERNS (Underperformers — vermijd deze openings en CTA-keuzes)',
        ),
      );
    }
    return parts.join('\n');
  }

  formatFingerprintsForPrompt(
    fingerprints: Fingerprint[],
    label: string,
  ): string {
    if (fingerprints.length === 0) return '';
    const lines: string[] = [
      '',
      `────────────────────────────────────────`,
      `${label}`,
      `────────────────────────────────────────`,
    ];
    for (const fp of fingerprints) {
      const parts: string[] = [];
      if (fp.opening_pattern) parts.push(`opening: "${fp.opening_pattern}"`);
      if (fp.cta_template) parts.push(`cta: ${fp.cta_template}`);
      if (fp.primary_dish_mentioned)
        parts.push(`gerecht: ${fp.primary_dish_mentioned}`);
      if (fp.hashtag_set && fp.hashtag_set.length > 0)
        parts.push(`hashtags: ${fp.hashtag_set.slice(0, 5).join(' ')}`);
      if (fp.theme) parts.push(`thema: ${fp.theme}`);
      lines.push(`  - ${parts.join(' | ')}`);
    }
    lines.push(
      'Instructie: distilleer het patroon, kopieer niet de exacte tekst. Anker-keywords (cuisine + stad + signature) mogen wel terugkeren.',
    );
    return lines.join('\n');
  }

  // ============================================================
  // 4. Heuristieken (private)
  // ============================================================

  /** Mapt campaign.type + content naar onze FillyChannel-enum. */
  private deriveChannel(
    campaign: Record<string, unknown>,
  ): FillyChannel {
    const type = campaign.type as string;
    if (type === 'mail') return 'mail';
    if (type === 'whatsapp') return 'whatsapp';
    // Social: platform-onderscheid uit campaign_social_content
    const social = Array.isArray(campaign.campaign_social_content)
      ? campaign.campaign_social_content[0]
      : campaign.campaign_social_content;
    const platform = (social as { platform?: string } | undefined)?.platform;
    if (platform === 'instagram') return 'instagram_feed';
    if (platform === 'facebook') return 'facebook';
    if (platform === 'tiktok') return 'tiktok';
    if (platform === 'google_business') return 'google_business';
    // Fallback voor onbekende of legacy social-type-campaigns.
    return 'instagram_feed';
  }

  /** Combineert body uit mail of social naar een platte string. */
  private deriveBodyText(campaign: Record<string, unknown>): string {
    const mail = Array.isArray(campaign.campaign_mail_content)
      ? campaign.campaign_mail_content[0]
      : campaign.campaign_mail_content;
    if (mail) {
      const m = mail as {
        subject_line?: string;
        body_plain?: string;
        body_html?: string;
      };
      return (
        m.body_plain ||
        (m.body_html ? this.stripHtml(m.body_html) : '') ||
        m.subject_line ||
        ''
      );
    }
    const social = Array.isArray(campaign.campaign_social_content)
      ? campaign.campaign_social_content[0]
      : campaign.campaign_social_content;
    if (social) {
      return (social as { caption?: string }).caption ?? '';
    }
    return '';
  }

  /** Pakt hashtags uit social_content of detecteert ze in mail-body. */
  private deriveHashtags(campaign: Record<string, unknown>): string[] {
    const social = Array.isArray(campaign.campaign_social_content)
      ? campaign.campaign_social_content[0]
      : campaign.campaign_social_content;
    if (social) {
      const hashtags = (social as { hashtags?: string[] | null }).hashtags;
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        return hashtags.map((h) => h.toLowerCase().replace(/^#/, ''));
      }
    }
    // Fallback: detecteer #hashtags in body-tekst.
    const body = this.deriveBodyText(campaign);
    const matches = body.match(/#([a-zA-Z0-9_]+)/g) ?? [];
    return Array.from(
      new Set(matches.map((m) => m.toLowerCase().replace(/^#/, ''))),
    ).sort();
  }

  /** Eerste 8 woorden, lowercased, geen leestekens. */
  private extractOpening(body: string): string | null {
    const clean = body
      .replace(/<[^>]+>/g, ' ') // strip HTML-tags voor de zekerheid
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .toLowerCase()
      .trim();
    if (!clean) return null;
    const words = clean.split(/\s+/).slice(0, 8);
    if (words.length === 0) return null;
    return words.join(' ');
  }

  /** Heuristische CTA-classificatie op basis van keywords in body. */
  private classifyCta(body: string): CtaTemplate | null {
    const lower = body.toLowerCase();
    // Volgorde matters: meest-specifieke eerst.
    if (/reserveer|boek\s+je|reserveren/i.test(lower)) return 'reserveer';
    if (/bel(\s+|\s*ons|\s*nu)/i.test(lower)) return 'bel';
    if (/menu\s*(bekijk|zien)|onze\s+kaart|bekijk\s+(ons|de)\s+menu/i.test(lower))
      return 'bekijk_menu';
    if (/in\s+de\s+comment|reageer\s+hieronder|comment\s+hieronder/i.test(lower))
      return 'vraag_in_comment';
    if (/tag\s+(een|je|jouw)\s+vriend/i.test(lower)) return 'tag_vriend';
    if (/save\s+(this|voor)|sla\s+(dit\s+)?op/i.test(lower))
      return 'save_voor_later';
    if (/rsvp|aanmelden\s+voor|inschrijven/i.test(lower)) return 'rsvp_event';
    if (/kom\s+langs|bezoek\s+ons|tot\s+ziens/i.test(lower)) return 'bezoek';
    return 'andere';
  }

  /**
   * Match body tegen menu-namen. Returnt eerste match (langste eerst
   * zodat "Pasta Carbonara" wint van "Pasta").
   */
  private matchPrimaryDish(
    body: string,
    menuNames: string[],
  ): string | null {
    if (!body || menuNames.length === 0) return null;
    const lower = body.toLowerCase();
    const sorted = [...menuNames].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      if (name && lower.includes(name.toLowerCase())) {
        return name;
      }
    }
    return null;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
