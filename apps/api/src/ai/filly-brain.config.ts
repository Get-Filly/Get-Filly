/**
 * ============================================================
 * Filly's brein — gecentraliseerde regels per kanaal
 * ============================================================
 *
 * Bron-van-waarheid voor alle Filly-prompts. Wijzig je hier een
 * waarde, dan past Filly's gedrag automatisch aan zonder dat we
 * door losse system-prompts moeten zoeken.
 *
 * Vertaalt het Word-document `docs/filly-brein.docx` (v1, 24 hfst)
 * 1-op-1 naar code. Wanneer er een conflict ontstaat tussen doc en
 * deze file: de doc is leading; pas de file aan, niet andersom.
 *
 * Timing (bestTimes/leadTime per kanaal) is per 2026-06-11 bijgewerkt
 * vanuit het Timing Brein-document (`Get-Filly-Posting-Tijden-v1_1.docx`,
 * onderzoeksgedreven: Buffer/Sprout/MailerLite/Rabobank e.a.). Externe
 * timing-factoren (weer/feestdagen/loondagen/seizoenen, hfst 4 van dat
 * doc) leven in `timing-factors.ts` — deterministisch berekend, niet
 * aan Claude gevraagd.
 *
 * Gebruik:
 *   import { CHANNEL_RULES, formatChannelRulesForPrompt } from './filly-brain.config';
 *   const rules = CHANNEL_RULES.instagram_feed;
 *   const promptBlock = formatChannelRulesForPrompt('instagram_feed');
 *
 * Wijzigen van CHANNEL_RULES → bump CHANNEL_RULES_VERSION zodat
 * historische performance-data correct kan worden geïnterpreteerd.
 */

// ============================================================
// Versie van het regel-model. Bumpen bij elke wijziging die
// downstream-services kan beïnvloeden (zelfde patroon als
// runner_version in HealthService).
// ============================================================
// v2 (2026-06-11): bestTimes per kanaal bijgewerkt vanuit het Timing
// Brein-doc (Posting-Tijden v1.1); GBP-frequentie 2→3/week.
export const CHANNEL_RULES_VERSION = 'v2';

// ============================================================
// Kanalen, funnel-fasen, lifecycle, archetypes, tone-signatures
// ============================================================

/**
 * Alle kanalen waar Filly content voor genereert. 'instagram_feed'
 * en 'instagram_reels' en 'instagram_stories' zijn bewust apart:
 * lengte, timing en format verschillen fundamenteel.
 */
export type FillyChannel =
  | 'mail'
  | 'instagram_feed'
  | 'instagram_reels'
  | 'instagram_stories'
  | 'facebook'
  | 'tiktok'
  | 'whatsapp'
  | 'google_business';

/** Funnel-fase van een uiting (hfst 11.1). */
export type FunnelStage = 'awareness' | 'consideration' | 'conversion';

/** Lifecycle-fase van een gast (hfst 11.2). */
export type LifecyclePhase =
  | 'nieuw'         // reservering gemaakt, nog niet gegeten
  | 'verse_gast'    // 1 bezoek, < 30 dagen
  | 'terugkeerder'  // 2-5 bezoeken in laatste 6 maanden
  | 'vaste_gast'    // 6+ bezoeken in laatste 6 maanden
  | 'slapend'       // > 90 dagen niet geweest
  | 'verloren';     // > 365 dagen niet geweest

/**
 * Brand-archetype dat de toon-keuze stuurt (hfst 15.1).
 * Eigenaar kiest primair + optioneel secundair archetype.
 */
export type BrandArchetype =
  | 'caregiver'   // familie-bistro, comfort food
  | 'lover'       // romantisch, fine-dining met emotie
  | 'magician'    // innovatief, experimenteel
  | 'everyman'    // toegankelijk, all-day-eatery
  | 'hero'        // sport, no-nonsense kwaliteit
  | 'explorer'    // reis-thema, fusion, exotic
  | 'sage'        // wijn-specialist, kennis-rijk
  | 'jester'      // casual fun, humor
  | 'creator'     // chef-driven, ambacht-trots
  | 'ruler'       // klassiek, traditie, autoriteit
  | 'innocent'    // puur, eerlijk, simpel
  | 'outlaw';     // tegendraads, anti-establishment

/**
 * Verteltechniek-signature voor 3-varianten-variatie (hfst 8.4).
 * Filly genereert per voorstel-set verplicht 3 verschillende signatures.
 */
export type ToneSignature =
  | 'feit_eerst'    // info → CTA, droog en helder
  | 'verhaal_eerst' // anekdote/scene → uitnodiging
  | 'vraag_eerst'   // rhetorische vraag → antwoord
  | 'lijst'         // opsomming-stijl, scanbaar
  | 'stelling';     // krachtige claim → onderbouwing

/** CTA-templates voor fingerprint-tracking (hfst 8.2). */
export type CtaTemplate =
  | 'reserveer'
  | 'bel'
  | 'bekijk_menu'
  | 'vraag_in_comment'
  | 'bezoek'
  | 'tag_vriend'
  | 'save_voor_later'
  | 'rsvp_event'
  | 'andere';

// ============================================================
// Per-kanaal-regels (hoofdstuk 4 + 6 + 7)
// ============================================================

/** Lengte-bandbreedte voor copy per kanaal (hfst 7 + 10). */
export interface CopyLength {
  minWords?: number;
  maxWords?: number;
  minChars: number;
  maxChars: number;
  /** Voor mail: aparte regel voor subject-line. */
  subject?: { minChars: number; maxChars: number };
  /** Voor mail: preheader. */
  preheader?: { minChars: number; maxChars: number };
}

/** Hashtag-strategie (hfst 4 per kanaal). */
export interface HashtagStrategy {
  /** Aantal hashtags; 0 = geen. */
  countMin: number;
  countMax: number;
  /** Anker-hashtags (uit restaurants.keywords + cuisine + city) tellen NIET mee. */
  excludeAnchorsFromCount: boolean;
  /** Plaatsing in caption. */
  placement: 'inline' | 'einde_caption' | 'eerste_comment' | 'niet_van_toepassing';
  /** Mix-strategie voor de niet-anker-laag. */
  mix?: string;
}

/** Beste plaatsings-tijden per kanaal (hfst 6). */
export interface BestTimes {
  /** Dagen waarop dit kanaal het beste werkt. Mon=1, Sun=7. */
  bestDays: number[];
  /** Sweet-spot uur-intervals (24h, ['HH:MM-HH:MM']). */
  bestHours: string[];
  /** Aandachtspunt of context. */
  note?: string;
}

/** Lead-time-regels voor urgentie-vs-optimum-beslissing (hfst 7.1). */
export interface LeadTimeRules {
  /** Onder dit aantal uren tot doel is dit kanaal niet meer bruikbaar. */
  minHours: number;
  /** Optimaal-interval [min, max] in uren tot doel. */
  optimalRangeHours: [number, number];
  /** Korte motivatie (komt in scheduled_reasoning bij overschrijving). */
  rationale: string;
}

/** Frequentie-rails (hfst 18.1). */
export interface FrequencyLimits {
  maxPerWeek: number;
  maxPerMonth: number;
}

/** Visuele eisen per kanaal (hfst 13.1 + 13.2). */
export interface VisualRequirements {
  /** Verplicht visueel? (true voor IG/TT/GBP, optioneel voor mail/FB) */
  required: boolean;
  /** Aspect-ratios die het kanaal accepteert. */
  aspectRatios: string[];
  /** Alt-text verplicht? */
  altTextRequired: boolean;
  /** Voor video-kanalen: lengte-bandbreedte. */
  videoLengthSeconds?: { min: number; max: number; sweetSpot: number };
}

/** Volledige kanaal-spec. */
export interface ChannelRules {
  channel: FillyChannel;
  /** Mens-leesbaar label voor UI en prompt-koppen. */
  label: string;
  /** Korte rol-omschrijving voor in system-prompt. */
  role: string;
  copyLength: CopyLength;
  hashtags: HashtagStrategy;
  bestTimes: BestTimes;
  leadTime: LeadTimeRules;
  frequency: FrequencyLimits;
  visual: VisualRequirements;
  /** Toon-modulatie-instructie per kanaal. */
  toneModulation: string;
  /** Hoe een CTA er op dit kanaal uitziet. */
  ctaStyle: string;
  /** Aanvullende kanaal-specifieke regels (do's/don'ts). */
  specifics: string[];
}

// ============================================================
// CHANNEL_RULES — de centrale spec-tabel
// ============================================================

export const CHANNEL_RULES: Record<FillyChannel, ChannelRules> = {
  // ----------- Mail -----------
  mail: {
    channel: 'mail',
    label: 'Mail',
    role: 'Directe communicatie naar bestaande gasten. Hoogste conversie, langste tekst toegestaan.',
    copyLength: {
      minWords: 75,
      maxWords: 200,
      minChars: 400,
      maxChars: 1200,
      subject: { minChars: 30, maxChars: 60 },
      preheader: { minChars: 50, maxChars: 90 },
    },
    hashtags: {
      countMin: 0,
      countMax: 0,
      excludeAnchorsFromCount: false,
      placement: 'niet_van_toepassing',
    },
    bestTimes: {
      bestDays: [4, 5], // do/vr
      bestHours: ['09:00-11:00', '17:30-18:30'],
      note: 'Vrijdag 18:00 = piek in open- én click-rate (MailerLite, 2.1M campagnes); do-ochtend ideaal voor weekend-promoties (+30% CTR vs ma/di). Vermijd zondag (click-rate -32%). Maand-begin (1-5) en rond de 25e (loondag) geven extra boost.',
    },
    leadTime: {
      minHours: 24,
      optimalRangeHours: [72, 168], // 3-7 dagen
      rationale: 'Mensen plannen uit-eten 2-5 dagen vooruit; onder 24u keldert open-rate.',
    },
    frequency: { maxPerWeek: 1, maxPerMonth: 4 },
    visual: {
      required: false,
      aspectRatios: ['16:9', '4:3'],
      altTextRequired: true,
    },
    toneModulation: 'Persoonlijk, warm, ondertekend door eigenaar of Filly. Schrijf alsof je een vaste gast persoonlijk benadert.',
    ctaStyle: 'Eén primaire CTA als button, max 3 woorden ("Reserveer nu" / "Bekijk menu"). Geen 2e of 3e CTA.',
    specifics: [
      'Subject ≤ 40 tekens zichtbaar op mobiel; eerste 30 zijn cruciaal.',
      'Preheader complementair aan subject, niet herhalen.',
      'Personalisatie (voornaam) in subject of opening = +26% open-rate.',
      'Niet meer dan 1 mailing per 10 dagen voor horeca.',
    ],
  },

  // ----------- Instagram Feed -----------
  instagram_feed: {
    channel: 'instagram_feed',
    label: 'Instagram (feed)',
    role: 'Visueel-eerst, brede zichtbaarheid. Discovery én herinnering voor bestaande followers.',
    copyLength: {
      minWords: 20,
      maxWords: 350, // hard max 2200 chars; sweet-spot lager
      minChars: 125,
      maxChars: 2200,
    },
    hashtags: {
      countMin: 3,
      countMax: 5,
      excludeAnchorsFromCount: true,
      placement: 'einde_caption',
      mix: 'Mix branded (#restaurantnaam) + niche-lokaal (#stadsnaam #wijknaam) + algemeen (#cuisine).',
    },
    bestTimes: {
      bestDays: [3, 4, 5], // wo/do/vr
      bestHours: ['12:00-13:00', '18:00-21:00'],
      note: 'Donderdag 9:00 en 21:00 = hoogste engagement (Buffer, 9.6M posts); wo 12:00 + 18:00 sterk; vr-lunch (11-13) triggert weekend-eetbeslissingen. Vermijd za-zo voor zakelijke posts (engagement -17%). Eerste 125 tekens cruciaal (zichtbaar vóór "meer"-klik).',
    },
    leadTime: {
      minHours: 6,
      optimalRangeHours: [24, 72], // 1-3 dagen
      rationale: 'Recent in feed = bovenaan; te ver vooruit = vergeten.',
    },
    frequency: { maxPerWeek: 5, maxPerMonth: 20 },
    visual: {
      required: true,
      aspectRatios: ['1:1', '4:5'],
      altTextRequired: true,
    },
    toneModulation: 'Visueel-eerst, kort, emoji\'s mogen (1-3). Schrijf zodat de copy het beeld versterkt, niet beschrijft.',
    ctaStyle: 'Een save/share-trigger ("Sla op voor je volgende date-night") of profiel-actie ("Link in bio voor reservering").',
    specifics: [
      'Eerste 125 tekens = hook + actie; pas daarna context.',
      'Hashtag-strategie weegt sinds 2023 minder; kwaliteit > kwantiteit.',
      'Save (bewaren) weegt sinds 2024 zwaarder dan like in het algoritme.',
      'Carousels (3-10 kaarten) hebben ~1.4× engagement vs single image.',
    ],
  },

  // ----------- Instagram Reels -----------
  instagram_reels: {
    channel: 'instagram_reels',
    label: 'Instagram (Reels)',
    role: 'Discovery via algoritme-push. Bereikt vooral niet-volgers.',
    copyLength: {
      minWords: 8,
      maxWords: 25,
      minChars: 50,
      maxChars: 100,
    },
    hashtags: {
      countMin: 2,
      countMax: 3,
      excludeAnchorsFromCount: true,
      placement: 'einde_caption',
      mix: 'Niche eerst (#foodietok #restaurantnaam), één breed (#cuisine).',
    },
    bestTimes: {
      bestDays: [4, 5, 6, 7], // do-zo
      bestHours: ['10:00-11:30', '16:00-17:30'],
      note: 'Reels 2-4u vóór het eetmoment plaatsen (lunch ~11:00, diner ~17:00): vlak voor de eetbeslissing presteert F&B-video het best (Dash Social; Reels 2.7% engagement vs 1.4% carousel). Weekend-avond werkt voor F&B óók.',
    },
    leadTime: {
      minHours: 4,
      optimalRangeHours: [24, 48],
      rationale: 'Algoritme-push duurt uren; te late post valt onder later interval.',
    },
    frequency: { maxPerWeek: 2, maxPerMonth: 8 },
    visual: {
      required: true,
      aspectRatios: ['9:16'],
      altTextRequired: false,
      videoLengthSeconds: { min: 7, max: 60, sweetSpot: 12 },
    },
    toneModulation: 'Vraag-vorm of one-liner. Caption is bijzaak; video moet het werk doen.',
    ctaStyle: 'Comment-trigger ("welke versie vind jij beter?") of profiel-actie ("link in bio").',
    specifics: [
      'Hook in eerste 1-3 sec: beeld dat verbazing/honger triggert.',
      'Trending audio > eigen audio voor algoritme-boost.',
      'Geen titel-frame (lege frame met tekst); direct beeld.',
    ],
  },

  // ----------- Instagram Stories -----------
  instagram_stories: {
    channel: 'instagram_stories',
    label: 'Instagram (Stories)',
    role: 'Last-minute push naar bestaande followers. Persoonlijk, direct, vervalt na 24u.',
    copyLength: {
      minWords: 5,
      maxWords: 12,
      minChars: 30,
      maxChars: 60,
    },
    hashtags: {
      countMin: 0,
      countMax: 0,
      excludeAnchorsFromCount: false,
      placement: 'niet_van_toepassing',
    },
    bestTimes: {
      bestDays: [1, 2, 3, 4, 5, 6, 7], // dagelijks
      bestHours: ['11:00-13:00', '17:00-19:00'],
      note: '"Wat is er vandaag"-content vlak vóór de eetmomenten (lunch + diner-prep). Verdwijnt na 24u, dus plaats op de dag zelf.',
    },
    leadTime: {
      minHours: 0,
      optimalRangeHours: [0, 24],
      rationale: 'Verdwijnt na 24u; per definitie last-minute kanaal.',
    },
    frequency: { maxPerWeek: 10, maxPerMonth: 30 },
    visual: {
      required: true,
      aspectRatios: ['9:16'],
      altTextRequired: false,
    },
    toneModulation: 'Telegram-stijl: 1 zin per slide, geen completer paragraaf.',
    ctaStyle: 'Sticker-CTA (poll, vraag, link, swipe-up). Direct, één-klik-actie.',
    specifics: [
      'Set van 3-5 slides; drop-off na 5.',
      'Sticker-engagement (poll/vraag) +20% vs alleen tekst.',
      'Hashtags hebben minimale impact op Stories — niet gebruiken.',
    ],
  },

  // ----------- Facebook -----------
  facebook: {
    channel: 'facebook',
    label: 'Facebook',
    role: 'Community-conversational. Oudere demografie; werkt goed voor familie- en event-content.',
    copyLength: {
      minWords: 40,
      maxWords: 120,
      minChars: 250,
      maxChars: 500,
    },
    hashtags: {
      countMin: 0,
      countMax: 0,
      excludeAnchorsFromCount: false,
      placement: 'niet_van_toepassing',
      mix: 'Geen hashtags; engagement neemt af met meer (Sprout Social 2024).',
    },
    bestTimes: {
      bestDays: [2, 3, 4, 5], // di-vr
      bestHours: ['11:00-13:00', '17:00-19:00'],
      note: 'Di-wo 12:00-20:00 = algemene piek (Sprout, 307K profielen); maaltijd-windows 11-13 en 17-19 voor food-content. Boekings-/aanbod-content scoort do-zo 11:00-14:00 en 19:00-21:00. Events: 2-3 weken vooraf aankondigen + reminder 2 dagen vooraf (3× hogere RSVP).',
    },
    leadTime: {
      minHours: 12,
      optimalRangeHours: [48, 120], // 2-5 dagen
      rationale: 'FB-feed langzamer maar verzadigd; lange aanloop helpt.',
    },
    frequency: { maxPerWeek: 3, maxPerMonth: 12 },
    visual: {
      required: false,
      aspectRatios: ['1.91:1', '1:1'],
      altTextRequired: true,
      videoLengthSeconds: { min: 15, max: 60, sweetSpot: 35 },
    },
    toneModulation: 'Storytelling, vraag stellen voor engagement. Warmer en uitgebreider dan IG.',
    ctaStyle: 'Vraag in copy ("Wat was jouw favoriet vorige week?") of direct event-link.',
    specifics: [
      'Geen hashtags.',
      'Voor evenementen ALTIJD Facebook-event (5× effectiever dan event-post).',
      'Live + video presteert beter dan statische foto.',
      'Ondertiteling op video\'s verplicht (auto-play = silent op FB).',
    ],
  },

  // ----------- TikTok -----------
  tiktok: {
    channel: 'tiktok',
    label: 'TikTok',
    role: 'Discovery via FYP-algoritme. Bereikt vooral jonger publiek; vereist consistente video-output.',
    copyLength: {
      minWords: 15,
      maxWords: 30,
      minChars: 100,
      maxChars: 150,
    },
    hashtags: {
      countMin: 3,
      countMax: 5,
      excludeAnchorsFromCount: true,
      placement: 'einde_caption',
      mix: 'Mix trending + #foodietok + #stadsnaam + 1 niche.',
    },
    bestTimes: {
      bestDays: [1, 2, 3, 4, 6], // ma-do + za
      bestHours: ['14:00-18:00', '19:00-21:00'],
      note: 'Ma-do 15:00-18:00 = F&B-piek ("afternoon slump": mensen plannen hun diner — Sprout); za-ochtend 10:00-12:00 voor weekend-content. Post 30-60 min vóór de piek: het algoritme test eerst klein en pusht daarna (4× FYP-distributie bij vroege engagement). Consistentie weegt zwaarder dan perfectie.',
    },
    leadTime: {
      minHours: 6,
      optimalRangeHours: [24, 72],
      rationale: 'Algoritme heeft tijd nodig om bereik te bouwen.',
    },
    frequency: { maxPerWeek: 5, maxPerMonth: 16 },
    visual: {
      required: true,
      aspectRatios: ['9:16'],
      altTextRequired: false,
      videoLengthSeconds: { min: 15, max: 60, sweetSpot: 22 },
    },
    toneModulation: 'Snel, trendy, energiek. Spreektaal mag.',
    ctaStyle: 'Comment-vraag of "reserveer via link in bio".',
    specifics: [
      'Hook in eerste 2-3 sec: vraag of contrast.',
      'Trending sound essentieel voor algoritme-boost.',
      'Seed-comment van eigen account in eerste minuut stuurt het gesprek.',
      'Voor traditionele horeca zelden de hoogste ROI; overweeg of de tijd-investering loont.',
    ],
  },

  // ----------- WhatsApp -----------
  whatsapp: {
    channel: 'whatsapp',
    label: 'WhatsApp',
    role: 'Persoonlijke last-minute-push naar opt-in gasten. Hoogste open-rate én hoogste ergernis-risico.',
    copyLength: {
      minWords: 50,
      maxWords: 120,
      minChars: 300,
      maxChars: 700,
    },
    hashtags: {
      countMin: 0,
      countMax: 0,
      excludeAnchorsFromCount: false,
      placement: 'niet_van_toepassing',
    },
    bestTimes: {
      bestDays: [2, 3, 4], // di-do
      bestHours: ['16:00-18:00', '11:00-15:00'],
      note: 'Vaste gasten di-do 16:00-18:00 (last-minute zelfde-avond-uitnodiging, 67% prefereert messaging boven bellen); lege-tafels-broadcast op de dag zelf om 11:00 of 15:00. NOOIT 22:00-09:00 of zondagavond (AVG redelijke uren). Verjaardags-bericht 7 dagen vóór de datum. Conservatief gebruiken; opt-in juridisch verplicht.',
    },
    leadTime: {
      minHours: 0.5,
      optimalRangeHours: [4, 24],
      rationale: 'Last-minute persoonlijke nudge; te vroeg voelt formeel.',
    },
    frequency: { maxPerWeek: 1, maxPerMonth: 1 }, // max 1× per 3 weken aan zelfde nummer
    visual: {
      required: false,
      aspectRatios: ['1:1', '4:3'],
      altTextRequired: false,
    },
    toneModulation: 'Persoonlijk, alsof eigenaar zelf typt. Vermijd marketing-toon.',
    ctaStyle: 'Directe reserveer-link of telefoon-tap. Eén klik, geen UTM-tracking zichtbaar.',
    specifics: [
      'Opt-in verplicht (AVG + WhatsApp Business policy).',
      'Max 1-2 emoji\'s; ALL-CAPS triggert spam-filter.',
      'Eerste outreach naar nummer (buiten 24u-window) vereist Meta-goedgekeurd template.',
      'Max 1× per 3 weken voor zelfde nummer om ergernis te voorkomen.',
    ],
  },

  // ----------- Google Business Profile -----------
  google_business: {
    channel: 'google_business',
    label: 'Google Business',
    role: 'Lokaal-actie-gericht. Lage directe engagement, hoge SEO-impact in local pack.',
    copyLength: {
      minWords: 80,
      maxWords: 250,
      minChars: 500,
      maxChars: 1500,
    },
    hashtags: {
      countMin: 0,
      countMax: 0,
      excludeAnchorsFromCount: false,
      placement: 'niet_van_toepassing',
      mix: 'Geen hashtags; werken niet op GBP.',
    },
    bestTimes: {
      bestDays: [1, 2, 3, 4, 5], // ma-vr
      bestHours: ['07:00-09:00', '14:00-16:00'],
      note: 'Ma-wo 7:00-9:00 = plan-modus begin van de week (weekreserveringen pieken ma/di, Toast +11%); event-posts wo-do 14:00-16:00 (weekend-planning piekt dan); weekend-aanbiedingen do-vr 14:00-16:00. Vaste maandagochtend-post ("wat is er nieuw") loont: wekelijks posten alleen al +28% klikken. 2-3 posts/week is het optimum.',
    },
    leadTime: {
      minHours: 12,
      optimalRangeHours: [24, 168], // 1-7 dagen
      rationale: 'Google indexeert binnen uren maar zoekers vinden 1-3 dagen na.',
    },
    frequency: { maxPerWeek: 3, maxPerMonth: 12 }, // 2-3/wk optimum (Shagbark/Wiremo)
    visual: {
      required: true,
      aspectRatios: ['4:3', '1:1', '16:9'],
      altTextRequired: false,
      videoLengthSeconds: { min: 10, max: 30, sweetSpot: 18 },
    },
    toneModulation: 'Lokaal-actie-gericht, feitelijk. Vermeld datum + adres + aanbod expliciet.',
    ctaStyle: 'CTA-knop: Bel / Reserveer / Bekijk menu / Leer meer. Eén knop per post.',
    specifics: [
      'Drie post-types: Update (verloopt 7d) / Event (datum-range) / Offer.',
      'Foto verplicht; vergroot CTR met 35%+.',
      'Geen hashtags — werken niet op GBP.',
      'Posts wegen mee in local-pack ranking.',
      'Q&A-sectie pro-actief vullen (weegt mee in lokale ranking).',
    ],
  },
};

// ============================================================
// CHANNEL_MIX_PER_THEME — default kanaal-keuze per thema-type
// (hoofdstuk 3, redeneer-flow stap 2)
// ============================================================

export type ThemeType =
  | 'feestdag'
  | 'rustige_dag_actie'
  | 'nieuw_menu'
  | 'seizoens_aanbod'
  | 'eenmalig_event'
  | 'algemeen';

export const CHANNEL_MIX_PER_THEME: Record<ThemeType, FillyChannel[]> = {
  feestdag: ['mail', 'instagram_feed', 'facebook'],
  rustige_dag_actie: ['whatsapp', 'instagram_stories'],
  nieuw_menu: ['instagram_feed', 'mail', 'google_business'],
  seizoens_aanbod: ['mail', 'instagram_feed', 'google_business'],
  eenmalig_event: ['mail', 'facebook', 'google_business'], // FB voor event-RSVP, GBP voor event-post
  algemeen: ['instagram_feed', 'mail'],
};

// ============================================================
// FUNNEL_STAGE_TO_CHANNELS — welke kanalen passen bij welke fase
// (hoofdstuk 11.1)
// ============================================================

export const FUNNEL_STAGE_TO_CHANNELS: Record<FunnelStage, FillyChannel[]> = {
  awareness: ['instagram_reels', 'tiktok', 'google_business', 'facebook'],
  consideration: ['instagram_feed', 'facebook', 'google_business'],
  conversion: ['mail', 'whatsapp', 'instagram_stories', 'google_business'],
};

// ============================================================
// Retention vs acquisition balans (hoofdstuk 11.4)
// ============================================================

/** Default-verhouding retentie/acquisitie van Filly's output. */
export const RETENTION_ACQUISITION_BALANCE = {
  retentionPercentage: 60, // 60% gericht op bestaande gasten
  acquisitionPercentage: 40,
  rationale:
    'Een nieuwe gast acquireren kost 5-7× meer dan een bestaande terugkrijgen. Default-bias op retentie tenzij eigenaar expliciet acquisitie-fase aangeeft.',
};

// ============================================================
// Cialdini-power-woorden (hoofdstuk 13.6)
// ============================================================

export type PersuasionPrinciple =
  | 'schaarste'
  | 'autoriteit'
  | 'sociale_bewijs'
  | 'reciprociteit'
  | 'consistentie'
  | 'sympathie';

export const PERSUASION_EXAMPLES: Record<PersuasionPrinciple, string[]> = {
  schaarste: [
    'Nog 4 tafels vrij voor zaterdag',
    'Beperkt aanbod, alleen deze maand',
    'Maximaal 12 personen per service',
  ],
  autoriteit: [
    'De chef die 12 jaar bij De Kromme Watergang werkte',
    'Gerecht ontwikkeld in samenwerking met de wijngaard',
    'Sinds 1987 in handen van dezelfde familie',
  ],
  sociale_bewijs: [
    '243 5-sterren-reviews dit jaar',
    'Onze populairste vrijdag-keuze',
    'Genoemd in De Volkskrant Top-50',
  ],
  reciprociteit: [
    'Bij reservering vanavond een aperitief van het huis',
    'Maak een proefreservering, eerste glas wijn is van ons',
  ],
  consistentie: [
    'Schrijf je in voor onze maandelijkse special-tip — geen verplichting',
    'Geef je naam door, dan houden we plek voor je open',
  ],
  sympathie: [
    'Onze chef komt uit jouw stad en weet hoe Hagenaars willen eten',
    'Wij zijn de buren van de wijnshop op de hoek',
  ],
};

// ============================================================
// Default rate-limits per restaurant (hoofdstuk 18.1)
// ============================================================

export const DEFAULT_RATE_LIMITS: Record<
  FillyChannel,
  FrequencyLimits
> = Object.fromEntries(
  Object.entries(CHANNEL_RULES).map(([k, v]) => [k, v.frequency]),
) as Record<FillyChannel, FrequencyLimits>;

// ============================================================
// Score-weights voor success-classificatie (hoofdstuk 9.4)
// ============================================================

export const SUCCESS_SCORE_THRESHOLDS = {
  winner: 80,        // ≥ 80 = top 20%
  average: 50,       // 50-79 = midden
  underperformer: 20, // 20-49 = onder benchmark
  // < 20 of measurement_complete_at NULL = no_data
};

// ============================================================
// Anti-repetitie-drempels (hoofdstuk 8.3)
// ============================================================

export const ANTI_REPETITION_THRESHOLDS = {
  /** Opening-overlap-percentage waarboven Filly waarschuwt. */
  openingOverlapPct: 60,
  /** Hashtag Jaccard-similarity waarboven Filly waarschuwt (excl. anker-hashtags). */
  hashtagJaccardPct: 70,
  /** Aantal achtereenvolgende campagnes met zelfde cta_template waarboven alarm. */
  maxConsecutiveSameCta: 3,
  /** Hoeveel recente fingerprints we meegeven aan Filly als 'vermijd-context'. */
  fingerprintLookbackCount: 10,
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Format de regels van één kanaal als plain text voor in een
 * system-prompt. Gebruikt door chat.service en suggestions.service.
 */
export function formatChannelRulesForPrompt(channel: FillyChannel): string {
  const r = CHANNEL_RULES[channel];
  const lines: string[] = [];
  lines.push(`KANAAL: ${r.label}`);
  lines.push(`Rol: ${r.role}`);
  lines.push(``);
  lines.push(`Lengte:`);
  if (r.copyLength.subject) {
    lines.push(`  - Subject: ${r.copyLength.subject.minChars}-${r.copyLength.subject.maxChars} tekens`);
  }
  if (r.copyLength.preheader) {
    lines.push(`  - Preheader: ${r.copyLength.preheader.minChars}-${r.copyLength.preheader.maxChars} tekens`);
  }
  if (r.copyLength.minWords && r.copyLength.maxWords) {
    lines.push(`  - Body: ${r.copyLength.minWords}-${r.copyLength.maxWords} woorden (${r.copyLength.minChars}-${r.copyLength.maxChars} tekens)`);
  } else {
    lines.push(`  - Body: ${r.copyLength.minChars}-${r.copyLength.maxChars} tekens`);
  }
  if (r.visual.videoLengthSeconds) {
    const v = r.visual.videoLengthSeconds;
    lines.push(`  - Video: ${v.min}-${v.max} sec (sweet-spot ${v.sweetSpot}s)`);
  }
  lines.push(``);
  lines.push(`Hashtags:`);
  if (r.hashtags.countMax === 0) {
    lines.push(`  - Geen hashtags op dit kanaal.`);
  } else {
    lines.push(`  - ${r.hashtags.countMin}-${r.hashtags.countMax} stuks (excl. anker-hashtags${r.hashtags.excludeAnchorsFromCount ? '' : ', incl. ankers'})`);
    if (r.hashtags.mix) lines.push(`  - Mix: ${r.hashtags.mix}`);
    lines.push(`  - Plaatsing: ${r.hashtags.placement}`);
  }
  lines.push(``);
  lines.push(`Toon-modulatie: ${r.toneModulation}`);
  lines.push(``);
  lines.push(`CTA: ${r.ctaStyle}`);
  lines.push(``);
  lines.push(`Specifiek:`);
  for (const s of r.specifics) {
    lines.push(`  - ${s}`);
  }
  return lines.join('\n');
}

/**
 * Harde lengte-check op een gegenereerde body. Een LLM houdt zich
 * nooit betrouwbaar aan een lengte puur op prompt-instructie; dit is
 * de deterministische controle achteraf (zie copy-length.guard.ts
 * voor het retry-mechanisme eromheen).
 */
export type CopyLengthVerdict = {
  ok: boolean;
  verdict: 'ok' | 'too_short' | 'too_long';
  chars: number;
  minChars: number;
  maxChars: number;
};

export function checkCopyLength(
  channel: FillyChannel,
  body: string,
): CopyLengthVerdict {
  const { minChars, maxChars } = CHANNEL_RULES[channel].copyLength;
  const chars = body.trim().length;
  const verdict =
    chars < minChars ? 'too_short' : chars > maxChars ? 'too_long' : 'ok';
  return { ok: verdict === 'ok', verdict, chars, minChars, maxChars };
}

/**
 * Bouwt het complete "regels per kanaal"-blok voor injectie in een
 * system-prompt. Default: alle 8 kanalen. Caller kan een subset
 * doorgeven (bv. alleen mail+IG voor een specifieke campagne-context).
 *
 * Gebruik in services:
 *   import { buildAllChannelsBlock } from '../ai/filly-brain.config';
 *   const block = buildAllChannelsBlock();
 *   const systemPrompt = `...${block}...`;
 */
export function buildAllChannelsBlock(channels?: FillyChannel[]): string {
  const list: FillyChannel[] = channels ?? [
    'mail',
    'instagram_feed',
    'instagram_reels',
    'instagram_stories',
    'facebook',
    'tiktok',
    'whatsapp',
    'google_business',
  ];
  const sep = '\n\n────────────────────────────────────────\n\n';
  const formatted = list.map((c) => formatChannelRulesForPrompt(c)).join(sep);
  return `────────────────────────────────────────
REGELS PER KANAAL (bron-van-waarheid, bij conflict met andere regels: HIER staat de juiste waarde)
────────────────────────────────────────

${formatted}
`;
}

/**
 * Mapt het legacy campaign.type ('mail' | 'social' | 'whatsapp') naar
 * een FillyChannel voor de scheduling-flow. 'social' defaultt naar
 * instagram_feed (meest voorkomende social-tijd-profiel). Bij een
 * expliciet social_platform kan de caller dit overschrijven.
 */
export function mapCampaignTypeToChannel(
  type: 'mail' | 'social' | 'whatsapp',
  socialPlatform?: string | null,
): FillyChannel {
  if (type === 'mail') return 'mail';
  if (type === 'whatsapp') return 'whatsapp';
  // social → bepaal op platform indien bekend
  switch (socialPlatform) {
    case 'facebook':
      return 'facebook';
    case 'tiktok':
      return 'tiktok';
    case 'google_business':
      return 'google_business';
    case 'instagram':
    default:
      return 'instagram_feed';
  }
}

/**
 * Lichte timing-formatter voor de scheduling-prompt: alleen de beste
 * dagen/tijden + lead-time-regel (hoofdstuk 6 + 7). Bewust géén
 * lengte/hashtag-regels (die horen bij content-generatie, niet bij
 * het tijdstip-vraagstuk).
 */
export function formatTimingForPrompt(channel: FillyChannel): string {
  const r = CHANNEL_RULES[channel];
  const dayNames = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const days = r.bestTimes.bestDays.map((d) => dayNames[d]).join(' / ');
  const lines: string[] = [];
  lines.push(`Beste dagen: ${days}`);
  lines.push(`Beste tijden: ${r.bestTimes.bestHours.join(' of ')}`);
  if (r.bestTimes.note) lines.push(`Let op: ${r.bestTimes.note}`);
  lines.push(
    `Lead-time: dit kanaal heeft minimaal ${r.leadTime.minHours}u nodig vóór de doel-datum; optimaal ${r.leadTime.optimalRangeHours[0]}-${r.leadTime.optimalRangeHours[1]}u. ${r.leadTime.rationale}`,
  );
  lines.push(
    `Urgentie-regel: als de doel-datum (bv. een rustige dag of evenement uit de bezetting) dichterbij is dan het optimale interval, kies dan zo dicht mogelijk bij "nu" en gebruik urgentie-taal in plaats van te wachten op het statistische sweet-spot.`,
  );
  return lines.join('\n');
}

/**
 * Multi-kanaal-variant van formatTimingForPrompt: één compact blok met
 * beste dagen/tijden + lead-time per kanaal. Voor prompts waarin Filly
 * zélf het kanaal kiest (bv. proactieve voorstellen) en dus de timing
 * van alle kandidaat-kanalen moet kennen om scheduled_for te vullen.
 * De generieke urgentie-regel staat er één keer onder in plaats van
 * per kanaal herhaald (scheelt prompt-tokens).
 */
export function buildAllTimingBlock(channels?: FillyChannel[]): string {
  const list: FillyChannel[] = channels ?? [
    'mail',
    'instagram_feed',
    'facebook',
    'tiktok',
    'whatsapp',
    'google_business',
  ];
  const dayNames = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const lines: string[] = [];
  lines.push('TIMING PER KANAAL (bron-van-waarheid voor scheduled_for):');
  for (const c of list) {
    const r = CHANNEL_RULES[c];
    const days = r.bestTimes.bestDays.map((d) => dayNames[d]).join('/');
    lines.push(
      `- ${r.label}: ${days} ${r.bestTimes.bestHours.join(' of ')}; lead-time min ${r.leadTime.minHours}u, optimaal ${r.leadTime.optimalRangeHours[0]}-${r.leadTime.optimalRangeHours[1]}u vóór de doel-datum.${r.bestTimes.note ? ` Let op: ${r.bestTimes.note}` : ''}`,
    );
  }
  lines.push('');
  lines.push(
    'Urgentie-regel: is de doel-datum dichterbij dan het optimale interval, kies dan zo dicht mogelijk bij "nu" en gebruik urgentie-taal in plaats van te wachten op het statistische sweet-spot.',
  );
  return lines.join('\n');
}

/**
 * Bepaal of dit kanaal überhaupt nog op tijd is voor het doel.
 * Returnt 'optimal' / 'within_minimum' / 'below_minimum' (skip).
 */
export function classifyLeadTime(
  channel: FillyChannel,
  hoursUntilTarget: number,
): 'optimal' | 'sweet_spot_window' | 'below_optimal' | 'below_minimum' {
  const rules = CHANNEL_RULES[channel].leadTime;
  if (hoursUntilTarget < rules.minHours) return 'below_minimum';
  if (hoursUntilTarget < rules.optimalRangeHours[0]) return 'below_optimal';
  if (hoursUntilTarget <= rules.optimalRangeHours[1]) return 'sweet_spot_window';
  return 'optimal';
}

/**
 * Suggereer een plaatsings-strategie op basis van uren-tot-doel.
 * Returnt timing-advies + of urgency-flag in copy moet.
 */
export interface PlacementStrategy {
  channel: FillyChannel;
  /** Hoe het algoritme-optimum scoort tegen onze deadline. */
  classification: ReturnType<typeof classifyLeadTime>;
  /** Mens-leesbare uitleg voor scheduled_reasoning. */
  reasoning: string;
  /** Voeg urgentie-taal toe aan de copy ("vanavond nog"). */
  urgencyFlagInCopy: boolean;
  /** Skip dit kanaal? */
  skip: boolean;
}

export function planChannelPlacement(
  channel: FillyChannel,
  hoursUntilTarget: number,
): PlacementStrategy {
  const classification = classifyLeadTime(channel, hoursUntilTarget);
  const rules = CHANNEL_RULES[channel];

  if (classification === 'below_minimum') {
    return {
      channel,
      classification,
      reasoning: `Skip: onder minimum lead-time (${rules.leadTime.minHours}u nodig, ${hoursUntilTarget.toFixed(1)}u beschikbaar). ${rules.leadTime.rationale}`,
      urgencyFlagInCopy: false,
      skip: true,
    };
  }

  if (classification === 'below_optimal') {
    return {
      channel,
      classification,
      reasoning: `Onder algoritme-optimum (sweet-spot ${rules.leadTime.optimalRangeHours[0]}-${rules.leadTime.optimalRangeHours[1]}u, nu ${hoursUntilTarget.toFixed(1)}u). Plaats z.s.m. met urgentie-taal in de copy.`,
      urgencyFlagInCopy: true,
      skip: false,
    };
  }

  return {
    channel,
    classification,
    reasoning: `Binnen ${classification === 'optimal' ? 'optimaal-interval' : 'sweet-spot-window'}; plaats op eerstvolgend kanaal-sweet-spot.`,
    urgencyFlagInCopy: false,
    skip: false,
  };
}

/**
 * Bouw de complete anker-keyword-set uit restaurant-data.
 * Deze ankers tellen NIET mee in anti-repetitie-overlap.
 */
export function buildAnchorKeywords(opts: {
  cuisineStyle: string[] | null;
  city: string | null;
  keywords: string[] | null;
  restaurantName: string;
}): string[] {
  const anchors: string[] = [opts.restaurantName.toLowerCase()];
  if (opts.cuisineStyle) anchors.push(...opts.cuisineStyle.map((c) => c.toLowerCase()));
  if (opts.city) anchors.push(opts.city.toLowerCase());
  if (opts.keywords) anchors.push(...opts.keywords.map((k) => k.toLowerCase()));
  return Array.from(new Set(anchors)); // dedupe
}

/**
 * Bepaal of een hashtag een anker is. Gebruikt door anti-repetitie-
 * Jaccard-vergelijking om ankers uit te sluiten.
 */
export function isAnchorHashtag(hashtag: string, anchors: string[]): boolean {
  const normalized = hashtag.toLowerCase().replace(/^#/, '');
  return anchors.some((a) => normalized.includes(a) || a.includes(normalized));
}

/**
 * Suggereer een default kanaal-mix op basis van thema-type én
 * funnel-stage. Combineert hoofdstuk 3 + 11.
 */
export function suggestChannelMix(
  themeType: ThemeType,
  funnelStage: FunnelStage,
): FillyChannel[] {
  const themeChannels = new Set(CHANNEL_MIX_PER_THEME[themeType]);
  const funnelChannels = new Set(FUNNEL_STAGE_TO_CHANNELS[funnelStage]);
  // Intersectie als die niet leeg is, anders thema-keuze (sterker signaal).
  const intersection = [...themeChannels].filter((c) => funnelChannels.has(c));
  return intersection.length > 0 ? intersection : [...themeChannels];
}
