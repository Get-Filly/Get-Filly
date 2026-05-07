import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import {
  CampaignsService,
  type CampaignType,
} from '../campaigns/campaigns.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';

// JSON-schema voor de suggestion-refine tool. Per 2026-05-07: van
// 1-variant-replace naar 3-variants-append. Eigenaar krijgt 3 nieuwe
// alternatieven naast de bestaande zodat 'ie kan vergelijken en terug
// kan naar de origineel-set door op een eerdere variant te klikken.
const SUGGESTION_REFINE_SCHEMA = {
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

type RefinedCampaignFromTool = {
  variants: Array<{ subject_line?: string; body: string }>;
};

// Cap op totaal aantal varianten per suggestie. Init = 3 (uit chat-
// flow), 1 refine-ronde voegt er 3 bij = 6 max. Daarna disabled,
// zelfde patroon als CampaignRefinePanel.
const SUGGESTION_VARIANTS_MAX = 6;

// Schema voor proposal-details: hoofdgerecht + bijgerechten + timing
// + bundle-prijs + hero-foto. Maakt een suggestie tastbaar, eigenaar
// ziet niet alleen "comfort food campagne" maar ook "Rundersukade
// €18,95 met aardappelpuree, rode kool, spruitjes als 3-gangen €24,50".
//
// Het 'source'-veld op elk dish-object dwingt Claude expliciet aan te
// geven of een gerecht uit de bestaande menukaart komt OF een nieuwe
// suggestie is, voorkomt dat Filly stilletjes namen verzint die niet
// op de kaart staan.
const PROPOSAL_DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    main_dish: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        source: { type: 'string', enum: ['menu', 'new'] },
        price_cents: { type: 'integer' },
      },
      required: ['name', 'description', 'source'],
    },
    sides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          source: { type: 'string', enum: ['menu', 'new'] },
          price_cents: { type: 'integer' },
        },
        required: ['name', 'description', 'source'],
      },
    },
    timing: { type: 'string' },
    price_bundle_cents: { type: 'integer' },
    price_bundle_label: { type: 'string' },
    hero_image: {
      type: 'object',
      properties: {
        emoji: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['emoji', 'description'],
    },
  },
  // Niets verplicht, een suggestie kan ook prima bestaan zonder
  // bundel-prijs of zonder bijgerechten (bv. een social-post zonder
  // gerecht-context).
} as const satisfies Anthropic.Tool.InputSchema;

type ProposalDetailsFromTool = {
  main_dish?: {
    name: string;
    description: string;
    source: 'menu' | 'new';
    price_cents?: number;
  };
  sides?: Array<{
    name: string;
    description: string;
    source: 'menu' | 'new';
    price_cents?: number;
  }>;
  timing?: string;
  price_bundle_cents?: number;
  price_bundle_label?: string;
  hero_image?: {
    emoji: string;
    description: string;
  };
};

// ============================================================
// On-demand suggesties-generator (Filly aan het werk-knop)
// ============================================================
// Schema voor `generate_proactive_suggestions`: Claude levert 3-5
// nieuwe campagne-voorstellen op basis van profile + menu + actuele
// bezetting/weer. Elke suggestie krijgt zijn eigen trigger_type
// zodat de UI 'm correct labelt (lage bezetting, weer, seizoen, etc).
const GENERATE_SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          trigger_type: {
            type: 'string',
            enum: [
              'low_occupancy',
              'weather',
              'seasonal',
              'retention',
              'birthday',
              'general',
            ],
          },
          urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
          campaign_type: {
            type: 'string',
            enum: ['mail', 'social', 'whatsapp'],
          },
          name: { type: 'string' },
          subject_line: { type: 'string' },
          body: { type: 'string' },
          reasoning: { type: 'string' },
          confidence: { type: 'number' },
          expected_extra_reservations: { type: 'integer' },
          expected_extra_revenue_cents: { type: 'integer' },
        },
        required: [
          'trigger_type',
          'urgency',
          'campaign_type',
          'name',
          'body',
          'reasoning',
        ],
      },
    },
  },
  required: ['suggestions'],
} as const satisfies Anthropic.Tool.InputSchema;

type GeneratedSuggestionFromTool = {
  trigger_type:
    | 'low_occupancy'
    | 'weather'
    | 'seasonal'
    | 'retention'
    | 'birthday'
    | 'general';
  urgency: 'low' | 'medium' | 'high';
  campaign_type: 'mail' | 'social' | 'whatsapp';
  name: string;
  subject_line?: string;
  body: string;
  reasoning: string;
  confidence?: number;
  expected_extra_reservations?: number;
  expected_extra_revenue_cents?: number;
};

type GenerateSuggestionsFromTool = {
  suggestions: GeneratedSuggestionFromTool[];
};

// ============================================================
// Low-occupancy detect-and-generate
// ============================================================
// Schema voor `generate_low_occupancy_campaign`: voor één specifieke
// rustige dag genereert Filly één toegespitst voorstel. Elke dag
// krijgt een eigen Claude-call zodat het advies écht past bij die
// weekdag, dat weer en de actuele bezetting.
const LOW_OCCUPANCY_SCHEMA = {
  type: 'object',
  properties: {
    campaign_type: { type: 'string', enum: ['mail', 'social', 'whatsapp'] },
    name: { type: 'string' },
    subject_line: { type: 'string' },
    body: { type: 'string' },
    target_segment: { type: 'string' },
    reasoning: { type: 'string' },
    confidence: { type: 'number' },
    expected_extra_reservations: { type: 'integer' },
    expected_extra_revenue_cents: { type: 'integer' },
  },
  required: ['campaign_type', 'name', 'body', 'reasoning'],
} as const satisfies Anthropic.Tool.InputSchema;

type LowOccupancyCampaignFromTool = {
  campaign_type: 'mail' | 'social' | 'whatsapp';
  name: string;
  subject_line?: string;
  body: string;
  target_segment?: string;
  reasoning: string;
  confidence?: number;
  expected_extra_reservations?: number;
  expected_extra_revenue_cents?: number;
};

// Drempel: een dag is "rustig" als de geschatte bezetting hier-onder
// ligt. V1 hard-coded; v2 instelbaar per restaurant via de account-
// pagina (zie BACKLOG).
const LOW_OCCUPANCY_THRESHOLD_PCT = 50;
// Window: dagen 2-14 vooruit. Vandaag/morgen overslaan want dan is
// een marketing-actie te laat om effect te hebben. >14 dagen heeft
// te onbetrouwbare bezettings-voorspelling.
const LOW_OCCUPANCY_WINDOW_MIN_DAYS = 2;
const LOW_OCCUPANCY_WINDOW_MAX_DAYS = 14;
const WEEKDAY_NL = [
  'zondag',
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
];

// Public-shape die de UI (camelCase) verwacht. Verschilt van de
// tool-shape (snake_case voor consistentie met Anthropic-conventies).
export type ProposalDetails = {
  mainDish?: {
    name: string;
    description: string;
    source: 'menu' | 'new';
    priceCents?: number;
  };
  sides?: Array<{
    name: string;
    description: string;
    source: 'menu' | 'new';
    priceCents?: number;
  }>;
  timing?: string;
  priceBundleCents?: number;
  priceBundleLabel?: string;
  heroImage?: {
    emoji: string;
    description: string;
  };
};

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type AiSuggestion = {
  id: string;
  trigger_type: string;
  trigger_context: Record<string, unknown> | null;
  suggested_campaign: SuggestedCampaign;
  status: SuggestionStatus;
  rejection_reason: string | null;
  approved_campaign_id: string | null;
  created_at: string;
  acted_at: string | null;
  confidence_score: number | null;
  expected_impact: {
    extra_reservations?: number;
    extra_revenue_cents?: number;
    retention_guests?: number;
  } | null;
  urgency: 'low' | 'medium' | 'high' | null;
  reasoning: string | null;
};

// Structuur van ai_suggestions.suggested_campaign. We ondersteunen
// twee shapes:
//   - Nieuw (sinds 3-varianten-flow): variants[] + selected_index
//   - Legacy: directe subject_line/body (voor seed-data en oudere
//     suggestion-rijen)
// Approve- en refine-logic checken eerst variants[], vallen anders
// terug op de legacy-velden.
export type SuggestedCampaign = {
  type?: 'mail' | 'social' | 'whatsapp';
  name?: string;
  // Nieuwe shape: max 3 alternatieven naast elkaar.
  variants?: Array<{
    subject_line?: string;
    body?: string;
  }>;
  selected_index?: number;
  // Legacy single-body shape (blijft bestaan voor seed-data).
  subject_line?: string;
  subject?: string;
  caption?: string;
  body?: string;
  segment?: string;
  // Andere velden (hero_photo, dishes, timing) worden in de UI getoond
  // maar zijn optioneel voor de campagne-creatie.
  [key: string]: unknown;
};

@Injectable()
export class SuggestionsService {
  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly campaigns: CampaignsService,
    private readonly ai: AiService,
    // Voor de proposal-details-call: Filly heeft profile + menu-block
    // nodig zodat hij kan refereren aan échte gerechten met échte
    // prijzen ipv generieke "lekker comfort food"-tekst.
    private readonly context: RestaurantContextService,
  ) {}

  async findAll(
    restaurantId: string,
    status?: SuggestionStatus,
    excludeTriggerTypes?: string[],
  ): Promise<AiSuggestion[]> {
    let query = this.supabase.client
      .from('ai_suggestions')
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    // Sinds 2026-05-04: chat_bundle-suggesties horen niet thuis in
    // de campagnes-pagina (geen approve-bundle-knop daar). Caller
    // kan ze uitsluiten via excludeTriggerTypes=['chat_bundle'].
    // Default niet filteren, chat-flow heeft 'm wél nodig voor de
    // bundle-card-state-detectie bij chat-history-load.
    if (excludeTriggerTypes && excludeTriggerTypes.length > 0) {
      query = query.not(
        'trigger_type',
        'in',
        `(${excludeTriggerTypes.map((t) => `"${t}"`).join(',')})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as AiSuggestion[];
  }

  async findById(
    restaurantId: string,
    suggestionId: string,
  ): Promise<AiSuggestion> {
    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Suggestie niet gevonden.');
    return data as AiSuggestion;
  }

  // Filly aan het werk-knop: genereert 3-5 nieuwe campagne-voorstellen
  // op basis van het restaurant-profiel + menu + actuele bezetting +
  // weer. Wordt aangeroepen wanneer de eigenaar op /dashboard/campagnes
  // op "Vraag Filly om voorstellen" klikt.
  //
  // Werkt ook voor net-nieuwe accounts waar nog geen reserveringen of
  // bezettings-data beschikbaar is, Filly valt dan terug op profile +
  // menu + seizoen, wat al genoeg is voor zinvolle voorstellen.
  //
  // Wel een minimum-check: zonder restaurant-naam OF zonder menu-items
  // zijn de voorstellen te generiek om waardevol te zijn → BadRequest
  // met een helpende NL-foutmelding.
  async generateOnDemand(
    restaurantId: string,
    userId: string | null,
  ): Promise<{ created: number; suggestions: AiSuggestion[] }> {
    // Stap 1, minimaal restaurant-naam + ≥3 menu-items vereist.
    const { data: restaurantRow, error: restErr } = await this.supabase.client
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurantId)
      .maybeSingle();
    if (restErr) throw new InternalServerErrorException(restErr.message);
    if (!restaurantRow) {
      throw new NotFoundException('Restaurant niet gevonden.');
    }

    const { count: menuCount } = await this.supabase.client
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true);

    if (!menuCount || menuCount < 3) {
      throw new BadRequestException(
        'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
      );
    }

    // Stap 2, context bouwen. Profile + menu zijn altijd nodig; live-
    // block is optioneel (lege string als bezetting/weer onbekend).
    const [profileBlock, menuBlock, liveBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
      this.context.buildLiveBlock(restaurantId).catch(() => ''),
    ]);

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const monthName = today.toLocaleString('nl-NL', { month: 'long' });

    const systemPrompt = `Je bent Filly, een AI-assistent voor het hieronder beschreven restaurant. De eigenaar drukt op "Vraag Filly om voorstellen" en jij genereert 3-5 concrete campagne-voorstellen die NU passen.

Je antwoord komt via de tool 'generate_proactive_suggestions'. Vul de tool-args met 3-5 verschillende voorstellen die elk een eigen invalshoek hebben.

Strategie voor variëteit (kies 3-5 verschillende invalshoeken):
- low_occupancy: een vooruitkijkende campagne om een rustige dag/avond op te vullen (alleen als je dat in de live-data ziet, of als seizoens-tip).
- weather: speel in op weer-thema (regen → comfort food binnen, zon → terras-aanbod).
- seasonal: huidige maand is ${monthName}, pak iets dat past bij dit seizoen.
- retention: vaste-gasten-segment activeren met iets exclusiefs.
- birthday: birthday-segment uitnodigen (alleen als zinvol bij dit type onderneming).
- general: een sterk concept dat los staat van een specifieke trigger, een signature-event of menu-launch.

Inhoudsregels:
- Schrijf alles in het Nederlands. Match de brand_tone uit het profiel.
- Refereer ALLEEN aan menu-items die letterlijk in MENU staan. Verzin geen gerechten, gebruik échte namen + prijzen voor concreetheid.
- Per voorstel: kies één campagne_type (mail, social, of whatsapp) dat past bij de doelgroep van die specifieke campagne. Mix de types over de 3-5 voorstellen.
- subject_line: alleen voor mail-campagnes; voor social/whatsapp laat je 'm weg.
- body: volledige uitgeschreven tekst, klaar om te versturen.
- name: korte werknaam (max 60 tekens), bv. "Pasta-week ${monthName.toLowerCase()}".
- reasoning: 1-2 zinnen NL waarom dit voorstel nu past, verwijs naar concrete signalen uit profile/menu/live-data.
- confidence: 0.0-1.0 hoe zeker je bent dat dit voorstel werkt voor deze onderneming.
- expected_extra_reservations / expected_extra_revenue_cents: ruwe schatting; mag null/0 als je geen basis hebt.

Vandaag is ${todayIso}.

---
CONTEXT, alles wat je weet over deze onderneming:

${profileBlock}

${menuBlock}

${liveBlock || 'LIVE: nog geen actuele bezettings- of weer-data beschikbaar.'}
---`;

    const userPrompt = `Geef 3-5 voorstellen voor de komende 2-4 weken die concreet passen bij dit restaurant.`;

    const raw = await this.ai.generateStructured<GenerateSuggestionsFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 4000,
      toolName: 'generate_proactive_suggestions',
      toolDescription:
        'Lever 3-5 concrete campagne-voorstellen voor dit restaurant op basis van profiel, menu en actuele context.',
      inputSchema: GENERATE_SUGGESTIONS_SCHEMA,
      meta: {
        restaurantId,
        userId: userId ?? undefined,
        feature: 'suggestions_generate',
      },
      cacheSystem: true,
    });

    // Stap 3, wegschrijven als ai_suggestions-rijen. Elk voorstel
    // krijgt zijn eigen rij met status='pending' zodat ze direct in de
    // /campagnes-strip verschijnen. We slaan de proposal_details niet
    // in dezelfde call op, die wordt later gegenereerd wanneer de
    // eigenaar op de detail-knop klikt (lazy-load = geen extra Claude-
    // calls voor voorstellen die hij toch overslaat).
    //
    // Defensieve guard: in zeldzame gevallen (token-cap-hit, malformed
    // tool-use response, of model retry-failure) krijgen we hier geen
    // array. Beter een nette NL-fout dan een 500 met cryptic stacktrace.
    if (!raw || !Array.isArray(raw.suggestions) || raw.suggestions.length === 0) {
      // Geen logger in deze service, gebruik console.warn (consistent
      // met andere fail-soft-handlers elders in dezelfde file).
      console.warn(
        `Filly's voorstellen-tool gaf geen geldige array terug voor restaurant ${restaurantId}. Raw response: ${JSON.stringify(raw)?.slice(0, 300)}`,
      );
      throw new InternalServerErrorException(
        'Filly kon nu geen voorstellen genereren. Dat gebeurt soms, probeer het over een minuut opnieuw.',
      );
    }
    const rows = raw.suggestions.map((s) => ({
      restaurant_id: restaurantId,
      trigger_type: s.trigger_type,
      trigger_context: {
        generated_on: todayIso,
        reason: s.reasoning,
      },
      suggested_campaign: {
        type: s.campaign_type,
        name: s.name,
        subject_line: s.subject_line,
        body: s.body,
      },
      status: 'pending',
      urgency: s.urgency,
      confidence_score:
        typeof s.confidence === 'number' &&
        s.confidence >= 0 &&
        s.confidence <= 1
          ? s.confidence
          : null,
      reasoning: s.reasoning,
      expected_impact: {
        extra_reservations: s.expected_extra_reservations ?? 0,
        extra_revenue_cents: s.expected_extra_revenue_cents ?? 0,
      },
    }));

    const { data: inserted, error: insErr } = await this.supabase.client
      .from('ai_suggestions')
      .insert(rows)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      );

    if (insErr) throw new InternalServerErrorException(insErr.message);

    return {
      created: inserted?.length ?? 0,
      suggestions: (inserted ?? []) as AiSuggestion[],
    };
  }

  // Detect-and-generate flow voor lage bezetting. Eigenaar klikt op
  // de alert-bar bovenaan het dashboard ("3 rustige dagen, laat
  // Filly voorstellen doen"); deze method bekijkt welke dagen in de
  // 2-14 dagen window nog onder de drempel zitten en genereert per
  // dag één toegespitst voorstel.
  //
  // Per dag een aparte Claude-call zodat de prompt rijk is met
  // dag-specifieke context (weekdag, weer-voorspelling, hoeveel
  // onder gemiddelde, of het dag-na-feestdag is). Eén generieke
  // call zou tot 3-5 voorstellen leiden die te abstract zijn,
  // "maandag" is geen "donderdag", die hebben elk eigen winning
  // segments en thema's.
  //
  // Skip-regel: dagen waarvoor al een PENDING low_occupancy-suggestie
  // bestaat slaan we over (anti-spam). Pas als de eigenaar de eerdere
  // suggestie heeft afgehandeld (approve/reject) komt 'ie weer in
  // aanmerking.
  //
  // Returnt het aantal nieuwe suggesties + de gegenereerde rijen
  // zodat de UI direct kan navigeren of een notificatie tonen.
  async detectAndGenerateLowOccupancy(
    restaurantId: string,
    userId: string | null,
  ): Promise<{
    detected: number;
    generated: number;
    skipped: number;
    suggestions: AiSuggestion[];
  }> {
    // Stap 1, Pre-flight: minstens 3 menu-items zodat Filly concrete
    // gerechten kan noemen. Zelfde guard als generateOnDemand.
    const { count: menuCount } = await this.supabase.client
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true);

    if (!menuCount || menuCount < 3) {
      throw new BadRequestException(
        'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
      );
    }

    // Stap 2, kandidaat-dagen ophalen: occupancy_days in window
    // 2-14 dagen vooruit, percentage onder drempel.
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() + LOW_OCCUPANCY_WINDOW_MIN_DAYS);
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + LOW_OCCUPANCY_WINDOW_MAX_DAYS);
    const fromIso = fromDate.toISOString().slice(0, 10);
    const toIso = toDate.toISOString().slice(0, 10);

    const { data: rawCandidates, error: occErr } = await this.supabase.client
      .from('occupancy_days')
      .select('date, occupancy_pct, estimated_guests, reservations_count')
      .eq('restaurant_id', restaurantId)
      .gte('date', fromIso)
      .lte('date', toIso)
      .lt('occupancy_pct', LOW_OCCUPANCY_THRESHOLD_PCT)
      .order('date', { ascending: true });

    if (occErr) throw new InternalServerErrorException(occErr.message);

    const candidates = (rawCandidates ?? []) as Array<{
      date: string;
      occupancy_pct: number | null;
      estimated_guests: number | null;
      reservations_count: number | null;
    }>;
    const detected = candidates.length;

    if (detected === 0) {
      return { detected: 0, generated: 0, skipped: 0, suggestions: [] };
    }

    // Stap 3, dedupliceer: dagen waarvoor al een PENDING low-
    // occupancy-suggestie bestaat slaan we over.
    const { data: existing, error: existErr } = await this.supabase.client
      .from('ai_suggestions')
      .select('trigger_context')
      .eq('restaurant_id', restaurantId)
      .eq('trigger_type', 'low_occupancy')
      .eq('status', 'pending');

    if (existErr) throw new InternalServerErrorException(existErr.message);

    const alreadyHandled = new Set<string>();
    for (const row of existing ?? []) {
      const ctx = row.trigger_context as { target_date?: string } | null;
      if (ctx?.target_date) alreadyHandled.add(ctx.target_date);
    }

    const todoDays = candidates.filter((c) => !alreadyHandled.has(c.date));
    const skipped = candidates.length - todoDays.length;

    if (todoDays.length === 0) {
      return {
        detected,
        generated: 0,
        skipped,
        suggestions: [],
      };
    }

    // Stap 4, context-blocks ophalen die voor alle dagen herbruikt
    // worden (profile + menu). Live-block laten we weg, vervangen
    // door per-dag-context die we zelf opbouwen.
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    // Stap 5, segment-counts voor extra context (welke segmenten
    // zijn beschikbaar als doelgroep voor mail/whatsapp).
    const { data: guestStats } = await this.supabase.client
      .from('guests')
      .select('mail_opt_in, whatsapp_opt_in, tags')
      .eq('restaurant_id', restaurantId);

    const guestPool = (guestStats ?? []) as Array<{
      mail_opt_in: boolean | null;
      whatsapp_opt_in: boolean | null;
      tags: string[] | null;
    }>;
    const segmentCounts = {
      mail_opt_in: guestPool.filter((g) => g.mail_opt_in).length,
      whatsapp_opt_in: guestPool.filter((g) => g.whatsapp_opt_in).length,
      vaste_gast: guestPool.filter((g) =>
        (g.tags ?? []).includes('vaste_gast'),
      ).length,
      vip: guestPool.filter((g) => (g.tags ?? []).includes('vip')).length,
      inactief: guestPool.filter((g) => (g.tags ?? []).includes('inactief'))
        .length,
    };

    // Stap 6, per dag een Claude-call met dag-specifieke context.
    // Sequentieel zodat we de rate-limit niet over de kop laten
    // gaan; bij 5+ kandidaat-dagen pakt elk z'n turn op de cache
    // (profile+menu zit in cacheSystem zodat dit goedkoop is).
    const generatedSuggestions: AiSuggestion[] = [];

    for (const day of todoDays) {
      const dateObj = new Date(day.date);
      const weekdayNl = WEEKDAY_NL[dateObj.getUTCDay()];
      const daysFromNow = Math.ceil(
        (dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const dayContext = `RUSTIGE DAG OM TE ACTIVEREN:
- Datum: ${day.date} (${weekdayNl}, over ${daysFromNow} dagen)
- Verwachte bezetting: ${day.occupancy_pct}% (drempel: ${LOW_OCCUPANCY_THRESHOLD_PCT}%)
- Geschat aantal gasten: ${day.estimated_guests ?? '?'}
- Reserveringen tot nu: ${day.reservations_count ?? 0}

GASTEN-SEGMENTEN VOOR ACTIVATIE:
- Mail-opt-in: ${segmentCounts.mail_opt_in} gasten
- WhatsApp-opt-in: ${segmentCounts.whatsapp_opt_in} gasten
- Vaste gasten: ${segmentCounts.vaste_gast}
- VIP: ${segmentCounts.vip}
- Inactief (>90 dagen niet geweest): ${segmentCounts.inactief}`;

      const systemPrompt = `Je bent Filly, een AI-assistent voor het hieronder beschreven restaurant. Voor één specifieke rustige dag in de komende 2 weken bedenk je het beste activatie-voorstel.

Je antwoord komt via de tool 'generate_low_occupancy_campaign'. Vul de tool-args met één concreet voorstel, campagne-type, naam, body, doelgroep en verwacht effect.

Inhoudsregels:
- Schrijf in het Nederlands. Match de brand_tone.
- Refereer ALLEEN aan menu-items die letterlijk in MENU staan.
- Kies campagne-type op basis van weekdag + segment:
  * vaste-gast/VIP-segment + acute dag (<5 dagen) → whatsapp (snel, persoonlijk)
  * brede zaal/weekend → social (zichtbaar, sfeervol)
  * 5-14 dagen vooruit + nieuwsbrief-segment → mail (uitgewerkter)
- Beschrijf doelgroep concreet (welk segment + waarom dat segment voor DEZE dag werkt).
- reasoning: 1-2 zinnen NL waarom dit voor DEZE specifieke dag/weekdag werkt, verwijs naar concrete getallen.
- expected_extra_reservations + expected_extra_revenue_cents: realistische schatting op basis van segment-grootte × verwachte conversie (typisch 5-15% bij relevante segmenten).

---
CONTEXT, restaurant-profiel + menu:

${profileBlock}

${menuBlock}

---
${dayContext}`;

      const userPrompt = `Maak één concreet voorstel voor ${weekdayNl} ${day.date}.`;

      try {
        const raw =
          await this.ai.generateStructured<LowOccupancyCampaignFromTool>({
            system: systemPrompt,
            prompt: userPrompt,
            model: 'claude-sonnet-4-6',
            maxTokens: 1500,
            toolName: 'generate_low_occupancy_campaign',
            toolDescription:
              'Lever één toegespitst marketing-voorstel om de bezetting van een rustige dag te verhogen.',
            inputSchema: LOW_OCCUPANCY_SCHEMA,
            meta: {
              restaurantId,
              userId: userId ?? undefined,
              feature: 'low_occupancy_detect',
            },
            cacheSystem: true,
          });

        const row = {
          restaurant_id: restaurantId,
          trigger_type: 'low_occupancy' as const,
          trigger_context: {
            target_date: day.date,
            weekday: weekdayNl,
            occupancy_pct: day.occupancy_pct,
            estimated_guests: day.estimated_guests,
            target_segment: raw.target_segment,
          },
          suggested_campaign: {
            type: raw.campaign_type,
            name: raw.name,
            subject_line: raw.subject_line,
            body: raw.body,
          },
          status: 'pending' as const,
          urgency: daysFromNow <= 4 ? 'high' : 'medium',
          confidence_score:
            typeof raw.confidence === 'number' &&
            raw.confidence >= 0 &&
            raw.confidence <= 1
              ? raw.confidence
              : null,
          reasoning: raw.reasoning,
          expected_impact: {
            extra_reservations: raw.expected_extra_reservations ?? 0,
            extra_revenue_cents: raw.expected_extra_revenue_cents ?? 0,
          },
        };

        const { data: inserted, error: insErr } = await this.supabase.client
          .from('ai_suggestions')
          .insert(row)
          .select(
            'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
          )
          .single();

        if (insErr) {
          // Eén dag mislukt mag niet de hele batch breken; loggen
          // en doorgaan met de volgende dag.
          // eslint-disable-next-line no-console
          console.warn(
            `low_occupancy insert faalde voor ${day.date}: ${insErr.message}`,
          );
          continue;
        }

        generatedSuggestions.push(inserted as AiSuggestion);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `low_occupancy Claude-call faalde voor ${day.date}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        // Volgende dag proberen, partiële resultaten zijn beter
        // dan helemaal niets bij rate-limit of tijdelijke API-hick.
        continue;
      }
    }

    return {
      detected,
      generated: generatedSuggestions.length,
      skipped,
      suggestions: generatedSuggestions,
    };
  }

  // Genereert de proposal-details voor één suggestie: hoofdgerecht +
  // bijgerechten + timing + bundle-prijs + hero-foto. Maakt een
  // suggestie tastbaar voor de eigenaar in de detail-modal.
  //
  // Cache: na 1× generation slaan we het resultaat op in
  // `suggested_campaign.proposal_details`. Volgende keer dat de modal
  // opent → 0 Claude-calls. Cache wordt ongeldig als de eigenaar de
  // campagne aanpast (refine-flow), want dan komt er een ander
  // hoofdgerecht-voorstel bij passen.
  async getProposalDetails(
    restaurantId: string,
    suggestionId: string,
  ): Promise<ProposalDetails> {
    const suggestion = await this.findById(restaurantId, suggestionId);

    // Cache-hit: eerder gegenereerd, geen Claude-call nodig.
    const cached = (suggestion.suggested_campaign as SuggestedCampaign)
      .proposal_details as ProposalDetails | undefined;
    if (cached && cached.mainDish) {
      return cached;
    }

    // Bouw rijke context: profile (sfeer/USPs/doelgroep) + menu
    // (echte gerechten met prijzen) + live-block (huidige bezetting,
    // weer) zodat Filly's voorstel past bij DEZE zaak op DIT moment.
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    const sc = suggestion.suggested_campaign;
    const campaignSnapshot = JSON.stringify(
      {
        type: sc.type,
        name: sc.name,
        body: sc.body || sc.variants?.[0]?.body,
        subject: sc.subject_line || sc.subject || sc.variants?.[0]?.subject_line,
      },
      null,
      2,
    );

    const systemPrompt = `Je bent Filly. Je krijgt een campagne-voorstel voor een specifiek restaurant en moet het concreet maken: welk hoofdgerecht past, welke bijgerechten, welk tijdstip, welke bundle-prijs, welke foto.

Je antwoord komt via de tool 'build_proposal_details'. Vul de tool-args in met een tastbare invulling van het voorstel.

Inhoudsregels:
- Schrijf in het Nederlands. Match de brand_tone uit het profiel.
- main_dish en sides: GEBRUIK BIJ VOORKEUR gerechten uit MENU (zie context). Zet source='menu' en pak de échte naam, beschrijving en prijs uit MENU.
- Alleen als geen passend menu-gerecht beschikbaar is, mag je een nieuw gerecht voorstellen met source='new'. Beschrijf het concreet (ingrediënten, bereiding) zodat de eigenaar weet wat hij zou koken.
- Maximaal 3 bijgerechten/sides. Geen losse drankjes als sides, alleen bij eet-gerechten relevant.
- timing: korte zin met dag(en) + tijdstip ("Donderdag t/m zondag · 17:00–22:00").
- price_bundle_cents: optioneel, alleen als een 2- of 3-gangen-bundel logisch is bij dit voorstel. In centen.
- price_bundle_label: zoals "3-gangen menu" of "2-gangen lunch". Korte tekst.
- hero_image: een passende emoji (1 stuk) + een korte fotoregie-beschrijving (max 100 tekens) die een fotograaf zou kunnen gebruiken. Géén foto-URL, die maken we later via een image-API.
- Als het voorstel een social-only post is zonder gerecht-context, mag je main_dish/sides leeg laten en alleen timing + hero_image vullen.

---
CONTEXT, alles wat je weet over deze onderneming:

${profileBlock}

${menuBlock}
---`;

    const userPrompt = `Campagne-voorstel:
${campaignSnapshot}

Maak dit tastbaar volgens de regels.`;

    const raw = await this.ai.generateStructured<ProposalDetailsFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      toolName: 'build_proposal_details',
      toolDescription:
        'Bouw een tastbare invulling van een campagne-voorstel: hoofdgerecht, bijgerechten, timing, bundle-prijs en hero-foto-suggestie.',
      inputSchema: PROPOSAL_DETAILS_SCHEMA,
      meta: {
        restaurantId,
        feature: 'suggestion_proposal_details',
      },
      // Profile + menu in system-prompt → caching pakt korting bij
      // her-bezoek of bij meerdere suggesties achter elkaar bekijken.
      cacheSystem: true,
    });

    const proposal = toProposalDetails(raw);

    // Cache schrijven. We mergen 'm in de bestaande suggested_campaign-
    // jsonb zodat alle andere velden (variants, body, etc) ongewijzigd
    // blijven. Stille fail: als update flakes, retourneer toch het
    // resultaat, de eigenaar ziet 'm gewoon, alleen volgende keer
    // wordt 'ie opnieuw berekend.
    const updatedCampaign: SuggestedCampaign = {
      ...sc,
      proposal_details: proposal,
    };
    await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: updatedCampaign })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId);

    return proposal;
  }

  // Goedkeur-flow: zet status op approved, maak een campagne aan uit
  // suggested_campaign, koppel approved_campaign_id. Retourneert de
  // bijgewerkte suggestie + het id van de nieuwe campagne zodat de
  // frontend direct kan doorlinken naar /dashboard/campagnes/[id].
  //
  // Transactioneel-achtig: als het aanmaken van de campagne faalt,
  // blijft de suggestie 'pending' (geen half-geupdatete state). Als
  // de status-update faalt nadat de campagne al bestaat, loggen we
  // het probleem maar rollen de campagne niet terug, hij is dan al
  // zichtbaar in /campagnes en kan de gebruiker handmatig doorlopen.
  async approve(
    restaurantId: string,
    suggestionId: string,
    userId: string,
  ): Promise<{ suggestion: AiSuggestion; campaignId: string }> {
    const suggestion = await this.findById(restaurantId, suggestionId);

    // Idempotent: als de suggestie al een keer is goedgekeurd (en de
    // campagne bestaat), geven we dezelfde campaignId terug zonder
    // opnieuw aan te maken. Voorkomt dubbele concept-campagnes als
    // de frontend na een navigatie z'n lokale state kwijt is en de
    // user opnieuw op "Goedkeuren" klikt. Stiller dan een error.
    if (
      suggestion.status === 'approved' &&
      suggestion.approved_campaign_id
    ) {
      return {
        suggestion,
        campaignId: suggestion.approved_campaign_id,
      };
    }

    // Afgewezen of verlopen → niet alsnog goedkeuren. User moet
    // eerst handmatig 'Terugzetten op open' doen. Dit is een bewuste
    // beslissingsgrens om stille 're-activations' te voorkomen.
    if (suggestion.status !== 'pending') {
      throw new InternalServerErrorException(
        `Deze suggestie is ${suggestion.status}. Zet 'm eerst terug op open via de Afgewezen-tab.`,
      );
    }

    const sc = suggestion.suggested_campaign ?? {};
    const type = sc.type;
    const name = typeof sc.name === 'string' ? sc.name.trim() : '';

    // Variant-shape (nieuw, sinds 3-varianten-flow) wint van legacy.
    // Pak geselecteerde variant; als selected_index out-of-range is,
    // val terug op 0 zodat we niet falen op corrupte state.
    let variantBody = '';
    let variantSubject = '';
    if (Array.isArray(sc.variants) && sc.variants.length > 0) {
      const idx =
        typeof sc.selected_index === 'number' &&
        sc.selected_index >= 0 &&
        sc.selected_index < sc.variants.length
          ? sc.selected_index
          : 0;
      const variant = sc.variants[idx] ?? {};
      variantBody =
        typeof variant.body === 'string' ? variant.body.trim() : '';
      variantSubject =
        typeof variant.subject_line === 'string'
          ? variant.subject_line.trim()
          : '';
    }

    // Body-fallback-keten: variant → body → caption (legacy seed).
    // Plaats een werkbare placeholder op als alles leeg is, aangevuld
    // met reasoning als context, zodat de eigenaar in concept-edit
    // kan voortbouwen.
    const rawBody =
      variantBody ||
      (typeof sc.body === 'string' && sc.body.trim().length > 0
        ? sc.body.trim()
        : typeof sc.caption === 'string' && sc.caption.trim().length > 0
          ? (sc.caption as string).trim()
          : '');

    const rawSubject =
      variantSubject ||
      (typeof sc.subject_line === 'string' &&
      sc.subject_line.trim().length > 0
        ? sc.subject_line.trim()
        : typeof sc.subject === 'string' &&
            (sc.subject as string).trim().length > 0
          ? (sc.subject as string).trim()
          : '');

    // Als er geen body is, vallen we terug op het onderwerp + reasoning
    // zodat de concept-campagne tenminste iets leesbaars bevat om vanuit
    // te werken.
    const body =
      rawBody ||
      [rawSubject, suggestion.reasoning]
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .join('\n\n') ||
      'Deze campagne is nog niet inhoudelijk uitgewerkt, klik op bewerken om de tekst toe te voegen.';

    if (
      (type !== 'mail' && type !== 'social' && type !== 'whatsapp') ||
      !name
    ) {
      throw new InternalServerErrorException(
        'Suggestie mist type of naam. Kan niet omzetten naar campagne.',
      );
    }

    const subject_line = rawSubject || null;

    // Variants uit de chat-flow meegeven als seed voor
    // campaigns.filly_variants. Zo gebruikt de detail-pagina (Met
    // Filly bewerken) deze drie als basis ipv 3 nieuwe te genereren.
    // Eigenaar kan daarna 1× regenerate → totaal max 6 alternatieven
    // (zoals oorspronkelijk bedoeld in migratie 0014).
    const seedVariants =
      Array.isArray(sc.variants) && sc.variants.length > 0
        ? sc.variants
            .filter(
              (v): v is { body: string; subject_line?: string } =>
                typeof v?.body === 'string' && v.body.trim().length > 0,
            )
            .map((v) => ({
              body: v.body.trim(),
              subject_line: v.subject_line?.trim(),
            }))
        : [];

    // Campagne aanmaken als concept. CampaignsService rolt zelf terug
    // bij content-insert-fout; hier hoeven we daar niet nog een laag
    // omheen.
    const { id: campaignId } = await this.campaigns.create(
      restaurantId,
      {
        name,
        type: type as CampaignType,
        subject_line,
        body,
        seed_variants: seedVariants,
      },
      userId,
    );

    // Per 2026-05-07: als de eigenaar vóór goedkeuring een eigen
    // verzendmoment heeft gezet (via /scheduled-endpoint), dan nemen
    // we dat over op de aangemaakte campagne. Anders blijft 't aan
    // CampaignSchedulePanel om alsnog een voorstel te genereren bij
    // eerste bezoek aan de detail-pagina.
    const customScheduledFor =
      typeof (sc as { scheduled_for?: string }).scheduled_for === 'string'
        ? ((sc as { scheduled_for?: string }).scheduled_for as string)
        : null;
    if (customScheduledFor) {
      try {
        await this.campaigns.setSchedule(
          restaurantId,
          campaignId,
          customScheduledFor,
        );
      } catch {
        // Niet fataal: als om wat voor reden de schedule-set faalt,
        // staat de campagne als concept zonder tijd, eigenaar kan 'm
        // alsnog op de detail-pagina aanpassen. Suggestie blijft wel
        // approved (geen rollback). Schedule-fout zelden voor.
      }
    }

    // Per 2026-05-07: foto kopiëren van restaurant-assets bucket naar
    // campaign-media bucket. We downloaden de bytes server-side en
    // re-uploaden via campaigns.uploadMedia, identiek aan de "Kies uit
    // bibliotheek"-flow op de campagne-detail-pagina. Werkt alleen voor
    // social/whatsapp (campaigns.uploadMedia weigert mail expliciet).
    const customMediaId =
      typeof (sc as { restaurant_media_id?: string | null })
        .restaurant_media_id === 'string'
        ? ((sc as { restaurant_media_id?: string }).restaurant_media_id as string)
        : null;
    if (customMediaId && (type === 'social' || type === 'whatsapp')) {
      try {
        const { data: mediaRow } = await this.supabase.client
          .from('restaurant_media')
          .select('file_path, file_name, mime_type')
          .eq('id', customMediaId)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();
        if (mediaRow?.file_path) {
          const { data: blob, error: dlErr } =
            await this.supabase.client.storage
              .from('restaurant-assets')
              .download(mediaRow.file_path as string);
          if (!dlErr && blob) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            await this.campaigns.uploadMedia(restaurantId, campaignId, {
              buffer,
              originalName: (mediaRow.file_name as string) ?? 'photo.jpg',
              mimeType:
                (mediaRow.mime_type as string) ?? 'image/jpeg',
            });
          }
        }
      } catch {
        // Niet fataal: campagne is aangemaakt, eigenaar kan op de
        // detail-pagina de foto alsnog kiezen via de bestaande flow.
      }
    }

    // Suggestie naar approved + FK koppelen.
    const { data: updated, error: updateErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({
        status: 'approved',
        acted_at: new Date().toISOString(),
        approved_campaign_id: campaignId,
      })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updateErr) throw new InternalServerErrorException(updateErr.message);

    return { suggestion: updated as AiSuggestion, campaignId };
  }

  // ============================================================
  // APPROVE BUNDLE, multi-channel uit chat → 1 group + 3 campaigns
  // ============================================================
  // Specifiek voor ai_suggestions met trigger_type='chat_bundle'.
  // Maakt:
  //   - 1 campaign_groups-rij (de bundle)
  //   - 3 campaigns met dezelfde group_id:
  //       * type='mail'   met subject_line + body in campaign_mail_content
  //       * type='social' platforms=['instagram'] in campaign_social_content
  //       * type='social' platforms=['facebook']  in campaign_social_content
  //   - ai_suggestions: status=approved, approved_campaign_id wijst
  //     naar de mail-campagne (anker; andere twee zijn via group_id
  //     vindbaar)
  // Idempotent: bij al-approved bundle returnen we de bestaande state.
  async approveBundle(
    restaurantId: string,
    suggestionId: string,
    userId: string,
    // Welke kanalen wil de eigenaar daadwerkelijk aanmaken? Default
    // alle 3. Eigenaar kan in de chat-bundle-kaart vinkjes uitzetten
    // om bv. alleen mail + IG te kiezen, geen FB.
    channels: Array<'mail' | 'instagram' | 'facebook'> = [
      'mail',
      'instagram',
      'facebook',
    ],
  ): Promise<{
    suggestion: AiSuggestion;
    groupId: string;
    mailCampaignId: string | null;
    instagramCampaignId: string | null;
    facebookCampaignId: string | null;
  }> {
    const suggestion = await this.findById(restaurantId, suggestionId);

    if (suggestion.trigger_type !== 'chat_bundle') {
      throw new InternalServerErrorException(
        'Deze suggestie is geen multi-channel-bundle. Gebruik approve i.p.v. approveBundle.',
      );
    }

    if (
      suggestion.status === 'approved' &&
      suggestion.approved_campaign_id
    ) {
      // Bestaande state ophalen, bij dubbele klik na navigation.
      // Group-id achterhalen via campaigns.group_id van de mail-campagne.
      const { data: mailCamp } = await this.supabase.client
        .from('campaigns')
        .select('id, group_id, type')
        .eq('id', suggestion.approved_campaign_id)
        .maybeSingle();
      if (mailCamp?.group_id) {
        const { data: siblings } = await this.supabase.client
          .from('campaigns')
          .select('id, type, campaign_social_content(platforms)')
          .eq('group_id', mailCamp.group_id);
        const ig = (siblings ?? []).find((s) => {
          const pl = (s.campaign_social_content as
            | { platforms?: string[] }[]
            | { platforms?: string[] }
            | null
            | undefined);
          const platforms = Array.isArray(pl)
            ? pl[0]?.platforms
            : pl?.platforms;
          return s.type === 'social' && platforms?.includes('instagram');
        });
        const fb = (siblings ?? []).find((s) => {
          const pl = (s.campaign_social_content as
            | { platforms?: string[] }[]
            | { platforms?: string[] }
            | null
            | undefined);
          const platforms = Array.isArray(pl)
            ? pl[0]?.platforms
            : pl?.platforms;
          return s.type === 'social' && platforms?.includes('facebook');
        });
        return {
          suggestion,
          groupId: mailCamp.group_id as string,
          mailCampaignId: (mailCamp.id as string | undefined) ?? null,
          instagramCampaignId: (ig?.id as string | undefined) ?? null,
          facebookCampaignId: (fb?.id as string | undefined) ?? null,
        };
      }
    }

    if (suggestion.status !== 'pending') {
      throw new InternalServerErrorException(
        `Deze bundle is ${suggestion.status}. Zet 'm eerst terug op open via de Afgewezen-tab.`,
      );
    }

    // Bundle-payload uit suggested_campaign-jsonb. Validatie hier
    // omdat de jsonb in theorie alles kan bevatten, bij corruptie
    // nette NL-foutmelding ipv crash.
    const sc = suggestion.suggested_campaign as
      | {
          name?: string;
          theme?: string;
          channels?: {
            mail?: { subject_line?: string; body?: string };
            instagram?: { caption?: string; hashtags?: string[] };
            facebook?: { caption?: string };
          };
        }
      | null;

    const bundleName =
      typeof sc?.name === 'string' && sc.name.trim()
        ? sc.name.trim().slice(0, 120)
        : 'Multi-channel campagne';
    const theme =
      typeof sc?.theme === 'string' ? sc.theme.trim().slice(0, 280) : null;
    const mailContent = sc?.channels?.mail;
    const igContent = sc?.channels?.instagram;
    const fbContent = sc?.channels?.facebook;

    // Validatie: voor elk GEKOZEN kanaal moet de bundle-payload de
    // bijbehorende content hebben. Niet-gekozen kanalen valideren we
    // niet, eigenaar wil ze toch niet aanmaken.
    if (channels.length === 0) {
      throw new InternalServerErrorException(
        'Selecteer minimaal één kanaal om aan te maken.',
      );
    }
    if (
      channels.includes('mail') &&
      (!mailContent?.subject_line?.trim() || !mailContent.body?.trim())
    ) {
      throw new InternalServerErrorException(
        'Mail-content ontbreekt in deze bundle.',
      );
    }
    if (channels.includes('instagram') && !igContent?.caption?.trim()) {
      throw new InternalServerErrorException(
        'Instagram-content ontbreekt in deze bundle.',
      );
    }
    if (channels.includes('facebook') && !fbContent?.caption?.trim()) {
      throw new InternalServerErrorException(
        'Facebook-content ontbreekt in deze bundle.',
      );
    }

    // 1) Group aanmaken, altijd, ongeacht aantal kanalen. Maakt het
    // makkelijk om later een ontbrekend kanaal toe te voegen via een
    // tweede approve-bundle-call.
    const { data: group, error: groupErr } = await this.supabase.client
      .from('campaign_groups')
      .insert({
        restaurant_id: restaurantId,
        name: bundleName,
        theme,
        created_by: userId,
      })
      .select('id')
      .single();
    if (groupErr) throw new InternalServerErrorException(groupErr.message);
    const groupId = group.id as string;

    // 2) Per gekozen kanaal een campagne aanmaken via CampaignsService.create.
    // Niet-gekozen kanalen krijgen null als ID, frontend toont dan de
    // checkbox als grijs i.p.v. een doorlink.
    let mailCampaignId: string | null = null;
    let instagramCampaignId: string | null = null;
    let facebookCampaignId: string | null = null;

    if (channels.includes('mail') && mailContent) {
      const { id } = await this.campaigns.create(
        restaurantId,
        {
          name: `${bundleName}, mail`,
          type: 'mail',
          subject_line: mailContent.subject_line!.trim().slice(0, 200),
          body: mailContent.body!.trim(),
          group_id: groupId,
        },
        userId,
      );
      mailCampaignId = id;
    }

    if (channels.includes('instagram') && igContent) {
      const { id } = await this.campaigns.create(
        restaurantId,
        {
          name: `${bundleName}, Instagram`,
          type: 'social',
          body: igContent.caption!.trim(),
          social_platforms: ['instagram'],
          social_hashtags: igContent.hashtags ?? [],
          group_id: groupId,
        },
        userId,
      );
      instagramCampaignId = id;
    }

    if (channels.includes('facebook') && fbContent) {
      const { id } = await this.campaigns.create(
        restaurantId,
        {
          name: `${bundleName}, Facebook`,
          type: 'social',
          body: fbContent.caption!.trim(),
          social_platforms: ['facebook'],
          group_id: groupId,
        },
        userId,
      );
      facebookCampaignId = id;
    }

    // 3) Suggestie afsluiten. Approved_campaign_id wijst naar het eerste
    // beschikbare kanaal (mail als 't gekozen is, anders IG, anders FB)
    // zodat we tenminste één anker hebben voor de "bekijk campagne"-link.
    const anchorCampaignId =
      mailCampaignId ?? instagramCampaignId ?? facebookCampaignId;

    const { data: updated, error: updateErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({
        status: 'approved',
        acted_at: new Date().toISOString(),
        approved_campaign_id: anchorCampaignId,
      })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();
    if (updateErr) throw new InternalServerErrorException(updateErr.message);

    return {
      suggestion: updated as AiSuggestion,
      groupId,
      mailCampaignId,
      instagramCampaignId,
      facebookCampaignId,
    };
  }

  async updateStatus(
    restaurantId: string,
    suggestionId: string,
    status: SuggestionStatus,
    rejectionReason?: string,
  ): Promise<AiSuggestion> {
    const updates: Record<string, unknown> = {
      status,
      acted_at: new Date().toISOString(),
    };
    if (rejectionReason !== undefined) {
      updates.rejection_reason = rejectionReason;
    }

    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .update(updates)
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as AiSuggestion;
  }

  // Selecteer welke variant de gebruiker als favoriet markeert.
  // Schrijft alleen selected_index naar de DB, behoudt de andere
  // varianten zodat user nog kan terugswitchen vóór goedkeuring.
  async selectVariant(
    restaurantId: string,
    suggestionId: string,
    index: number,
  ): Promise<AiSuggestion> {
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Variant-index moet een positief getal zijn.');
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    const sc = suggestion.suggested_campaign ?? {};
    const variants = Array.isArray(sc.variants) ? sc.variants : [];
    if (index >= variants.length) {
      throw new BadRequestException(
        `Geen variant op index ${index}; deze suggestie heeft er ${variants.length}.`,
      );
    }

    const newSc: SuggestedCampaign = { ...sc, selected_index: index };
    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSc })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Per 2026-05-07: eigenaar koppelt vóór goedkeuring een foto uit de
  // restaurant-bibliotheek aan een pending-suggestie. Alleen voor
  // social/whatsapp-types; mail ondersteunt nog geen media (consistent
  // met campaigns.uploadMedia). mediaId=null wist de koppeling.
  // Bij goedkeuring kopieert approve() het bestand van restaurant-
  // assets naar de campaign-media bucket zodat de campagne een eigen
  // kopie heeft (los van bibliotheek-deletions).
  async setMedia(
    restaurantId: string,
    suggestionId: string,
    mediaId: string | null,
  ): Promise<AiSuggestion> {
    const suggestion = await this.findById(restaurantId, suggestionId);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Alleen open voorstellen zijn aanpasbaar (deze is ${suggestion.status}).`,
      );
    }
    const sc = suggestion.suggested_campaign ?? {};
    const type = sc.type;
    if (type === 'mail') {
      throw new BadRequestException(
        "Mail-suggesties ondersteunen nog geen foto's.",
      );
    }

    let validatedId: string | null = null;
    if (mediaId) {
      // Check dat de media-rij bestaat en bij dit restaurant hoort.
      // Voorkomt dat eigenaar een vreemde id naar binnen kan smokkelen
      // of dat we straks bij approve een dangling-FK hebben.
      const { data: row, error: lookupErr } = await this.supabase.client
        .from('restaurant_media')
        .select('id')
        .eq('id', mediaId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (lookupErr) throw new InternalServerErrorException(lookupErr.message);
      if (!row) {
        throw new BadRequestException(
          'Foto niet gevonden in jouw bibliotheek.',
        );
      }
      validatedId = row.id as string;
    }

    const newSc = {
      ...sc,
      restaurant_media_id: validatedId,
    } as SuggestedCampaign & { restaurant_media_id?: string | null };

    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSc })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Per 2026-05-07: eigenaar kan vóór goedkeuring de inhoud van een
  // specifieke variant zelf bewerken (subject + body). Geldig op
  // pending-suggestion. Werkt alleen op multi-variant shape; legacy
  // single-body wordt eerst gepromoot tot 1-variant-array.
  async editVariant(
    restaurantId: string,
    suggestionId: string,
    index: number,
    patch: { subject_line?: string | null; body?: string },
  ): Promise<AiSuggestion> {
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException(
        'Variant-index moet een positief getal zijn.',
      );
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Alleen open voorstellen zijn aanpasbaar (deze is ${suggestion.status}).`,
      );
    }

    const sc = suggestion.suggested_campaign ?? {};
    // Promoot legacy single-body naar 1-variant-array zodat onze
    // edit-logica uniform is. Daarna kan de eigenaar ook in legacy-
    // suggesties een variant bewerken zonder dat we extra code-paden
    // hoeven te onderhouden.
    let variants: Array<{ subject_line?: string; body: string }> =
      Array.isArray(sc.variants) && sc.variants.length > 0
        ? sc.variants
            .filter(
              (v): v is { body: string; subject_line?: string } =>
                typeof v?.body === 'string' && v.body.length > 0,
            )
            .map((v) => ({ body: v.body, subject_line: v.subject_line }))
        : (() => {
            const legacyBody =
              typeof sc.body === 'string' && sc.body.length > 0
                ? sc.body
                : typeof sc.caption === 'string'
                  ? sc.caption
                  : '';
            const legacySubject =
              typeof sc.subject_line === 'string'
                ? sc.subject_line
                : typeof sc.subject === 'string'
                  ? sc.subject
                  : undefined;
            return legacyBody
              ? [{ body: legacyBody, subject_line: legacySubject }]
              : [];
          })();

    if (index >= variants.length) {
      throw new BadRequestException(
        `Geen variant op index ${index}; deze suggestie heeft er ${variants.length}.`,
      );
    }

    const newBody =
      typeof patch.body === 'string' && patch.body.trim().length > 0
        ? patch.body.trim().slice(0, 5000)
        : variants[index].body;
    if (!newBody) {
      throw new BadRequestException('Body mag niet leeg zijn.');
    }

    // subject_line patch-semantiek: undefined = laat staan, null/lege
    // string = wis, niet-lege string = vervang. Zo kan eigenaar een
    // mail-onderwerp ook expliciet weghalen voor social/whatsapp.
    let newSubject: string | undefined = variants[index].subject_line;
    if (patch.subject_line === null || patch.subject_line === '') {
      newSubject = undefined;
    } else if (
      typeof patch.subject_line === 'string' &&
      patch.subject_line.trim().length > 0
    ) {
      newSubject = patch.subject_line.trim().slice(0, 200);
    }

    variants = variants.map((v, i) =>
      i === index
        ? { body: newBody, subject_line: newSubject }
        : v,
    );

    const newSuggested: SuggestedCampaign = {
      ...sc,
      variants,
      // Sync top-level body/subject met de geselecteerde variant zodat
      // legacy-readers (kaart-preview) ook de bewerkte inhoud zien.
      ...(typeof sc.selected_index === 'number' &&
        sc.selected_index === index && {
          body: newBody,
          subject_line: newSubject,
        }),
    };

    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSuggested })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Per 2026-05-07: eigenaar kan vóór goedkeuring zelf het verzendmoment
  // aanpassen op een pending-suggestie. Filly's oorspronkelijke voorstel
  // (gebaseerd op target_date + standaard-tijd per type) blijft als
  // referentie zichtbaar in de modal zodat we kunnen waarschuwen als de
  // eigenaar afwijkt. Slaat de keuze op in suggested_campaign.scheduled_for
  // (jsonb-veld, geen migratie nodig). De approve-flow leest dit veld en
  // neemt 'm over op de aangemaakte campagne.
  async setScheduled(
    restaurantId: string,
    suggestionId: string,
    scheduledForIso: string,
  ): Promise<AiSuggestion> {
    const trimmed = scheduledForIso?.trim();
    if (!trimmed) {
      throw new BadRequestException('scheduled_for is verplicht.');
    }
    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) {
      throw new BadRequestException(
        'Ongeldige datum/tijd. Verwacht ISO-formaat.',
      );
    }
    const now = Date.now();
    if (dt.getTime() < now - 60 * 1000) {
      throw new BadRequestException(
        'Verzendmoment moet in de toekomst liggen.',
      );
    }
    // Veiligheidsmarge: niet verder dan een jaar vooruit, anders is er
    // waarschijnlijk een typo/UI-fout.
    if (dt.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Verzendmoment ligt te ver in de toekomst (max 1 jaar).',
      );
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Alleen open voorstellen zijn aanpasbaar (deze is ${suggestion.status}).`,
      );
    }

    const sc = (suggestion.suggested_campaign ?? {}) as SuggestedCampaign & {
      scheduled_for?: string;
    };
    const newSc = { ...sc, scheduled_for: dt.toISOString() };

    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSc })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Per 2026-05-07: 'refine' herzien van 1-variant-replace naar 3-
  // variants-append. Eigenaar krijgt 3 nieuwe alternatieven naast de
  // bestaande zodat 'ie kan kiezen of terug kan naar de origineel-set
  // door op een eerdere variant te klikken. Cap = 6 totaal (init 3 +
  // 1 refine-ronde van 3), zelfde patroon als CampaignRefinePanel.
  // Instructie blijft optioneel, default genereert Filly fris in
  // andere tonen/invalshoeken dan de bestaande set.
  async refine(
    restaurantId: string,
    suggestionId: string,
    instruction: string,
  ): Promise<AiSuggestion> {
    const trimmed = instruction.trim();
    if (trimmed.length > 1000) {
      throw new BadRequestException(
        'Aanpassings-instructie mag maximaal 1000 tekens zijn.',
      );
    }

    const suggestion = await this.findById(restaurantId, suggestionId);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Alleen open voorstellen zijn te bewerken (deze is ${suggestion.status}).`,
      );
    }

    const sc = suggestion.suggested_campaign ?? {};
    const currentType: 'mail' | 'social' | 'whatsapp' =
      sc.type === 'mail' || sc.type === 'social' || sc.type === 'whatsapp'
        ? sc.type
        : 'mail';
    const currentName =
      typeof sc.name === 'string' ? (sc.name as string) : '';

    // Bestaande varianten ophalen. Bij legacy (geen variants-array) bouwen
    // we 1 synthetische variant uit de top-level body/subject zodat we
    // ook daar 3 alternatieven naast kunnen zetten in een uniforme array.
    const existingVariants: Array<{ subject_line?: string; body: string }> =
      Array.isArray(sc.variants) && sc.variants.length > 0
        ? sc.variants
            .filter(
              (v): v is { body: string; subject_line?: string } =>
                typeof v?.body === 'string' && v.body.length > 0,
            )
            .map((v) => ({
              body: v.body,
              subject_line: v.subject_line,
            }))
        : (() => {
            const legacyBody =
              typeof sc.body === 'string' && sc.body.length > 0
                ? sc.body
                : typeof sc.caption === 'string'
                  ? sc.caption
                  : '';
            const legacySubject =
              typeof sc.subject_line === 'string'
                ? sc.subject_line
                : typeof sc.subject === 'string'
                  ? sc.subject
                  : undefined;
            return legacyBody
              ? [{ body: legacyBody, subject_line: legacySubject }]
              : [];
          })();

    if (existingVariants.length >= SUGGESTION_VARIANTS_MAX) {
      throw new BadRequestException(
        `Maximum aantal versies (${SUGGESTION_VARIANTS_MAX}) bereikt. Kies een bestaande variant of pas 'm handmatig aan.`,
      );
    }

    // Tool-use forceert het JSON-schema (3 variants exact). Wij geven
    // Filly het bestaande materiaal mee als 'vermijd-lijst' zodat de
    // alternatieven inhoudelijk anders zijn dan wat al gegenereerd is.
    const systemPrompt = `Je bent Filly, een AI-assistent voor de horeca. Je krijgt een bestaande campagne en moet drie alternatieve versies bedenken die wezenlijk anders zijn van toon en invalshoek.

Je antwoord komt via de tool 'generate_alternatives'. Lever exact 3 varianten.

Inhoudsregels:
- Schrijf in het Nederlands, in dezelfde campagne-context (zelfde gerecht/aanbod).
- Drie tonen: bv. zakelijk-professioneel, warm-persoonlijk, kort-prikkelend. Onderling duidelijk verschillend.
- Verzin geen cijfers of feiten die niet in de oorspronkelijke versie stonden.
- Bij type=mail vul je per variant ook subject_line; bij social/whatsapp laat je subject_line weg.
- Vermijd de exacte zinnen uit de bestaande varianten.`;

    const existingPayload = JSON.stringify(existingVariants, null, 2);
    const instructionLine = trimmed
      ? `Extra instructie van de eigenaar: ${trimmed}`
      : 'Geen specifieke instructie van de eigenaar, ga voor brede variatie in toon.';
    const userPrompt = `Campagne-naam: ${currentName}\nType: ${currentType}\n\nBestaande versies (vermijd herhaling):\n${existingPayload}\n\n${instructionLine}\n\nGeef drie nieuwe varianten via 'generate_alternatives'.`;

    const parsed = await this.ai.generateStructured<RefinedCampaignFromTool>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 2500,
      toolName: 'generate_alternatives',
      toolDescription:
        'Lever exact drie alternatieve versies van de campagne, in andere tonen/invalshoeken dan de bestaande set.',
      inputSchema: SUGGESTION_REFINE_SCHEMA,
      meta: {
        restaurantId,
        feature: 'suggestion_refine',
      },
    });

    const newAlternatives = (parsed.variants ?? [])
      .map((v) => ({
        body:
          typeof v.body === 'string' ? v.body.trim().slice(0, 5000) : '',
        subject_line:
          typeof v.subject_line === 'string' && v.subject_line.trim().length > 0
            ? v.subject_line.trim().slice(0, 200)
            : undefined,
      }))
      .filter((v) => v.body.length > 0)
      // Cap zodat we nooit over de max heen gaan, ook als de claude-
      // call meer zou opleveren dan 3.
      .slice(0, SUGGESTION_VARIANTS_MAX - existingVariants.length);

    if (newAlternatives.length === 0) {
      throw new InternalServerErrorException(
        'Filly leverde geen bruikbare alternatieven, probeer opnieuw.',
      );
    }

    const newVariants = [...existingVariants, ...newAlternatives];
    // selected_index ongewijzigd zodat de eigenaar de oorspronkelijk
    // gekozen variant blijft zien als 'actief'. Eigenaar klikt zelf
    // op een nieuwe versie om die over te nemen.
    const newSuggested: SuggestedCampaign = {
      ...sc,
      type: currentType,
      variants: newVariants,
    };

    const { data: updated, error: updErr } = await this.supabase.client
      .from('ai_suggestions')
      .update({ suggested_campaign: newSuggested })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .select(
        'id, trigger_type, trigger_context, suggested_campaign, status, rejection_reason, approved_campaign_id, created_at, acted_at, confidence_score, expected_impact, urgency, reasoning',
      )
      .single();

    if (updErr) throw new InternalServerErrorException(updErr.message);
    return updated as AiSuggestion;
  }

  // Maakt een nieuwe suggestie aan vanuit een chat-proposal. Accepteert
  // de hele suggested_campaign-shape (incl. variants) zodat we niets
  // verliezen tussen parser en DB. Retourneert de id zodat de caller
  // 'm kan koppelen aan het chat-bericht (chat_messages.ai_suggestion_id).
  async createFromChat(
    restaurantId: string,
    suggested: SuggestedCampaign,
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .insert({
        restaurant_id: restaurantId,
        trigger_type: 'chat',
        suggested_campaign: suggested,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return { id: data.id as string };
  }

  // ============================================================
  // BUNDLE, multi-channel proposal vanuit chat (mail + IG + FB)
  // ============================================================
  // Sinds 2026-05-04: Filly kan in chat een bundle voorstellen, één
  // thema over drie kanalen tegelijk. Slaan we op als één
  // ai_suggestions-rij met trigger_type='chat_bundle' en de hele
  // bundle in suggested_campaign-jsonb. Approve-flow detecteert het
  // trigger_type en maakt:
  //   - 1 campaign_groups-rij (de bundel)
  //   - 3 campaigns met dezelfde group_id (mail / social-IG / social-FB)
  //   - 3 content-rijen (campaign_mail_content + 2× campaign_social_content)
  // Eigenaar kan elk kanaal individueel pushen of inplannen daarna.
  async createBundleFromChat(
    restaurantId: string,
    bundle: {
      name: string;
      theme: string;
      channels: {
        mail: { subject_line: string; body: string };
        instagram: { caption: string; hashtags?: string[] };
        facebook: { caption: string };
      };
    },
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase.client
      .from('ai_suggestions')
      .insert({
        restaurant_id: restaurantId,
        trigger_type: 'chat_bundle',
        suggested_campaign: bundle,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return { id: data.id as string };
  }
}

// Converteert de tool-shape (snake_case zoals Anthropic-conventie
// voorschrijft voor JSON-schema's) naar de UI-shape (camelCase zoals
// we elders in de frontend gebruiken). Filters lege strings + caps
// price_cents op niet-negatieve integers als safety-net.
function toProposalDetails(raw: ProposalDetailsFromTool): ProposalDetails {
  const trim = (s?: string) =>
    s && s.trim().length > 0 ? s.trim() : undefined;
  const safePrice = (p?: number) =>
    typeof p === 'number' && p >= 0 ? Math.round(p) : undefined;

  const out: ProposalDetails = {};

  if (raw.main_dish && raw.main_dish.name?.trim()) {
    out.mainDish = {
      name: raw.main_dish.name.trim(),
      description: raw.main_dish.description?.trim() ?? '',
      source: raw.main_dish.source,
      priceCents: safePrice(raw.main_dish.price_cents),
    };
  }

  if (raw.sides && raw.sides.length > 0) {
    const sides = raw.sides
      .filter((s) => s.name?.trim())
      .map((s) => ({
        name: s.name.trim(),
        description: s.description?.trim() ?? '',
        source: s.source,
        priceCents: safePrice(s.price_cents),
      }));
    if (sides.length > 0) out.sides = sides;
  }

  out.timing = trim(raw.timing);
  out.priceBundleCents = safePrice(raw.price_bundle_cents);
  out.priceBundleLabel = trim(raw.price_bundle_label);

  if (raw.hero_image && raw.hero_image.emoji?.trim()) {
    out.heroImage = {
      emoji: raw.hero_image.emoji.trim(),
      description: raw.hero_image.description?.trim() ?? '',
    };
  }

  return out;
}
