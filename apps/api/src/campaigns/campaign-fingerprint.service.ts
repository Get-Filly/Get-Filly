import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AiService } from '../ai/ai.service';
import {
  type FillyChannel,
  type CtaTemplate,
  type ToneSignature,
  ANTI_REPETITION_THRESHOLDS,
  isAnchorHashtag,
} from '../ai/filly-brain.config';

/** Resultaat van een anti-repetitie-check op een kandidaat-variant. */
export interface RepetitionWarning {
  /** Type overtreding voor UI-iconografie. */
  kind: 'opening' | 'hashtags' | 'cta';
  /** NL-tekst die naast de variant getoond wordt. */
  message: string;
}

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
    // Voor de v2-classifier (tone_signature + theme). Haiku-call,
    // fail-soft: bij fout blijven die velden null.
    private readonly ai: AiService,
  ) {}

  // JSON-schema voor de tone/theme-classifier. Forceert Claude tot een
  // van de 5 tone-signatures + een korte vrije thema-tekst.
  private static readonly CLASSIFY_SCHEMA = {
    type: 'object' as const,
    properties: {
      tone_signature: {
        type: 'string',
        enum: [
          'feit_eerst',
          'verhaal_eerst',
          'vraag_eerst',
          'lijst',
          'stelling',
        ],
        description:
          'De verteltechniek van de opening: feit_eerst (info→cta), verhaal_eerst (anekdote/scene), vraag_eerst (rhetorische vraag), lijst (opsomming), stelling (krachtige claim).',
      },
      theme: {
        type: 'string',
        description:
          'Korte thematische categorie in 1-3 woorden, bv. "moederdag", "rustige dag", "nieuw menu", "asperge-seizoen", "weekend-actie".',
      },
    },
    required: ['tone_signature', 'theme'],
  };

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

      // 4b) v2-classifier: tone_signature + theme via Haiku. Fail-soft —
      // bij fout of lege body blijven beide null en valt 'extractor_version'
      // terug op v1-gedrag.
      const classified = await this.classifyToneAndTheme(
        body,
        (campaign as { restaurant_id: string }).restaurant_id,
      );

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
            theme: classified?.theme ?? null,
            primary_dish_mentioned: primaryDish,
            tone_signature: classified?.tone_signature ?? null,
            extractor_version: classified ? 'v2' : 'v1',
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

  /**
   * v2-classifier: laat Haiku de tone_signature + theme uit de body
   * halen. Goedkoop (~€0,001), draait alleen bij approve (niet per
   * generation). Fail-soft: returnt null bij lege body of API-fout —
   * de heuristische velden blijven dan gewoon staan.
   */
  private async classifyToneAndTheme(
    body: string,
    restaurantId: string,
  ): Promise<{ tone_signature: ToneSignature; theme: string } | null> {
    const clean = body.replace(/<[^>]+>/g, ' ').trim();
    if (clean.length < 20) return null; // te weinig tekst om te classificeren

    try {
      const result = await this.ai.generateStructured<{
        tone_signature: ToneSignature;
        theme: string;
      }>({
        system:
          'Je classificeert de schrijfstijl van een horeca-campagnetekst. Bepaal de verteltechniek van de opening (tone_signature) en de thematische categorie (theme, 1-3 woorden NL). Antwoord uitsluitend via de tool.',
        prompt: `Campagnetekst:\n\n${clean.slice(0, 1500)}`,
        // Haiku 4.5: simpele classificatie, laagste kosten.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 200,
        toolName: 'classify_campaign_style',
        toolDescription:
          'Classificeer de tone_signature en theme van de campagnetekst.',
        inputSchema: CampaignFingerprintService.CLASSIFY_SCHEMA,
        meta: {
          restaurantId,
          feature: 'fingerprint_classify',
        },
      });

      const theme = (result.theme ?? '').trim().slice(0, 60);
      if (!result.tone_signature || !theme) return null;
      return { tone_signature: result.tone_signature, theme };
    } catch (err) {
      this.logger.warn(
        `classifyToneAndTheme gefaald (fingerprint blijft v1): ${
          err instanceof Error ? err.message : err
        }`,
      );
      return null;
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

  // ============================================================
  // Anti-repetitie-check (filly-brein hfst 8.6)
  // ============================================================

  /**
   * Vergelijkt een kandidaat-variant (de tekst die Filly net genereerde,
   * of die de eigenaar bekijkt) met de laatste N fingerprints van dit
   * restaurant+kanaal. Returnt waarschuwingen wanneer:
   *   - opening_pattern > 60% woord-overlap met laatste 5
   *   - hashtag-set Jaccard > 70% met laatste 3 (anker-hashtags excl.)
   *   - cta_template identiek aan laatste 2 op rij
   *
   * Geen LLM-call: puur deterministisch, sub-ms. Bij overschrijding
   * toont de UI een waarschuwing naast de variant; we regenereren NOOIT
   * automatisch (eigenaar beslist — filly-brein hfst 8.6).
   *
   * `anchorKeywords` zijn de cuisine + stad + signature-termen die WEL
   * herhaald mogen worden (SEO); de caller bouwt ze met buildAnchorKeywords.
   */
  async checkRepetition(
    restaurantId: string,
    channel: FillyChannel,
    candidate: { body: string; hashtags?: string[] },
    anchorKeywords: string[] = [],
  ): Promise<RepetitionWarning[]> {
    const recent = await this.getRecentFingerprints(
      restaurantId,
      channel,
      ANTI_REPETITION_THRESHOLDS.fingerprintLookbackCount,
    );
    if (recent.length === 0) return []; // geen historie → niets te vergelijken

    const warnings: RepetitionWarning[] = [];

    const candidateOpening = this.extractOpening(candidate.body);
    const candidateCta = this.classifyCta(candidate.body);
    const candidateHashtags = (candidate.hashtags ?? []).map((h) =>
      h.toLowerCase().replace(/^#/, ''),
    );

    // 1. Opening-overlap met laatste 5.
    if (candidateOpening) {
      const last5 = recent.slice(0, 5);
      const tooSimilar = last5.find(
        (fp) =>
          fp.opening_pattern &&
          this.wordOverlapPct(candidateOpening, fp.opening_pattern) >
            ANTI_REPETITION_THRESHOLDS.openingOverlapPct,
      );
      if (tooSimilar) {
        warnings.push({
          kind: 'opening',
          message:
            'Deze opening lijkt sterk op een recente campagne. Overweeg een andere insteek voor meer variatie.',
        });
      }
    }

    // 2. Hashtag-Jaccard met laatste 3 (anker-hashtags niet meegerekend).
    if (candidateHashtags.length > 0) {
      const candidateNonAnchor = candidateHashtags.filter(
        (h) => !isAnchorHashtag(h, anchorKeywords),
      );
      if (candidateNonAnchor.length > 0) {
        const last3 = recent.slice(0, 3);
        const tooSimilar = last3.find((fp) => {
          const prev = (fp.hashtag_set ?? []).filter(
            (h) => !isAnchorHashtag(h, anchorKeywords),
          );
          if (prev.length === 0) return false;
          return (
            this.jaccardPct(candidateNonAnchor, prev) >
            ANTI_REPETITION_THRESHOLDS.hashtagJaccardPct
          );
        });
        if (tooSimilar) {
          warnings.push({
            kind: 'hashtags',
            message:
              'Je gebruikt grotendeels dezelfde hashtags als recente posts. Wissel een paar niet-merk-hashtags af om nieuw publiek te bereiken.',
          });
        }
      }
    }

    // 3. CTA identiek aan laatste 2 op rij.
    if (candidateCta) {
      const last2 = recent.slice(
        0,
        ANTI_REPETITION_THRESHOLDS.maxConsecutiveSameCta - 1,
      );
      if (
        last2.length >= ANTI_REPETITION_THRESHOLDS.maxConsecutiveSameCta - 1 &&
        last2.every((fp) => fp.cta_template === candidateCta)
      ) {
        warnings.push({
          kind: 'cta',
          message: `Je sluit al meerdere campagnes af met dezelfde call-to-action ("${candidateCta}"). Varieer de afsluiter voor meer effect.`,
        });
      }
    }

    return warnings;
  }

  /**
   * UI-wrapper: pakt de huidige geselecteerde variant van een campagne,
   * bouwt de anker-keyword-set uit restaurant-data, en draait
   * checkRepetition. Returnt warnings die de detail-page naast de
   * variant kan tonen. RLS-active via requestSupabase.
   */
  async checkForCampaign(
    restaurantId: string,
    campaignId: string,
  ): Promise<RepetitionWarning[]> {
    // Campagne + content + restaurant-anker-data in één keer.
    const [{ data: campaign }, { data: restaurant }] = await Promise.all([
      this.requestSupabase.client
        .from('campaigns')
        .select(
          'id, type, campaign_mail_content(body_plain, body_html), campaign_social_content(platform, caption, hashtags)',
        )
        .eq('id', campaignId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
      this.requestSupabase.client
        .from('restaurants')
        .select('name, city, cuisine_style, keywords')
        .eq('id', restaurantId)
        .maybeSingle(),
    ]);

    if (!campaign) return [];

    const channel = this.deriveChannel(campaign as Record<string, unknown>);
    const body = this.deriveBodyText(campaign as Record<string, unknown>);
    const hashtags = this.deriveHashtags(campaign as Record<string, unknown>);

    // Anker-keywords: cuisine + stad + naam + handmatige keywords.
    const r = (restaurant ?? {}) as {
      name?: string;
      city?: string | null;
      cuisine_style?: string[] | null;
      keywords?: string[] | null;
    };
    const anchors: string[] = [];
    if (r.name) anchors.push(r.name.toLowerCase());
    if (r.city) anchors.push(r.city.toLowerCase());
    if (Array.isArray(r.cuisine_style))
      anchors.push(...r.cuisine_style.map((c) => c.toLowerCase()));
    if (Array.isArray(r.keywords))
      anchors.push(...r.keywords.map((k) => k.toLowerCase()));

    return this.checkRepetition(
      restaurantId,
      channel,
      { body, hashtags },
      Array.from(new Set(anchors)),
    );
  }

  /** Woord-overlap-percentage tussen twee genormaliseerde openings (0-100). */
  private wordOverlapPct(a: string, b: string): number {
    const setA = new Set(a.split(/\s+/).filter(Boolean));
    const setB = new Set(b.split(/\s+/).filter(Boolean));
    if (setA.size === 0 || setB.size === 0) return 0;
    let shared = 0;
    for (const w of setA) if (setB.has(w)) shared += 1;
    // Overlap relatief aan de kleinste set (gevoeliger voor korte openings).
    return Math.round((shared / Math.min(setA.size, setB.size)) * 100);
  }

  /** Jaccard-similarity tussen twee string-arrays (0-100). */
  private jaccardPct(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    let intersect = 0;
    for (const x of setA) if (setB.has(x)) intersect += 1;
    return Math.round((intersect / union.size) * 100);
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
