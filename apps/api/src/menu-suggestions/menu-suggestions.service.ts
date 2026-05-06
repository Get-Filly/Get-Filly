import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AiService } from '../ai/ai.service';
import { RestaurantContextService } from '../ai/restaurant-context.service';
import { AuditLogService } from '../common/audit-log.service';

// ============================================================
// MenuSuggestionsService, Filly-gerecht-voorstellen
// ============================================================
//
// Wat doet dit:
//   Eigenaar drukt op "✨ Vraag Filly om gerecht-voorstellen", Filly
//   analyseert het bestaande menu + restaurant-profiel + huidig
//   seizoen, en genereert 3-5 concrete voorstellen voor nieuwe
//   gerechten. Eigenaar kan elk voorstel:
//     - accepteren (→ wordt menu_items-rij)
//     - afwijzen   (status='rejected')
//     - laten verfijnen ("andere variant" → nieuwe pending-rij)
//
// Waarom een aparte tabel ipv menu_items met status-veld:
//   Voorgestelde gerechten mogen niet meetellen in:
//     - Filly's eigen prompts (RestaurantContextService.buildMenuBlock)
//     - dashboard counts ("X gerechten")
//     - de data-export (AVG art. 20)
//   Dat is veiliger met fysieke scheiding dan met een filter dat overal
//   moet worden onthouden.
//
// Kostenbescherming:
//   - generate is rate-limited via AiRateLimitGuard (op restaurant-id)
//   - refine: max 3 keer per origineel-voorstel
//   - Lazy expire: pending voorstellen ouder dan 30 dagen krijgen
//     status='expired' bij list-call. Voorkomt dat de tabel oneindig
//     groeit als een eigenaar voorstellen negeert.
// ============================================================

// Schema voor de generate-call. minItems/maxItems forceert exact 3
// voorstellen, Claude kan er geen 1 of 5 maken. Bewust niet hoger:
// dit is een dure call (Sonnet 4.6, ~3500 tokens output) en max 1×
// per dag per restaurant. 3 voorstellen geeft een chef genoeg
// invalshoeken zonder de tokens te laten exploderen.
const GENERATE_SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Naam van het gerecht in het Nederlands. Concreet, geen marketing-fluff. Max 80 tekens.',
            maxLength: 80,
          },
          description: {
            type: 'string',
            description:
              '1-2 zinnen menu-omschrijving. Noem hoofdingrediënt + bereiding. Geen prijs in de tekst.',
            maxLength: 240,
          },
          category: {
            type: 'string',
            description:
              'voorgerecht | hoofdgerecht | bijgerecht | dessert | borrelhap | drank',
          },
          subcategory: {
            type: 'string',
            description:
              'Optioneel detail (bv. "vis", "vlees", "vegetarisch", "wijn-rood"). Mag leeg.',
          },
          price_cents_low: {
            type: 'number',
            description:
              'Onderkant prijs-range in centen (bv. 1450 = €14,50). Realistische marktprijs voor dit gerecht in deze prijsklasse.',
          },
          price_cents_high: {
            type: 'number',
            description: 'Bovenkant prijs-range in centen.',
          },
          dietary_tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'vegetarian, vegan, gluten_free, lactose_free, etc. Lege array als regulier.',
          },
          source_type: {
            type: 'string',
            enum: ['gap_analysis', 'profile_based', 'seasonal'],
            description:
              'gap_analysis: vult een gat in bestaand menu (geen visgerecht, geen vegetarisch hoofd). profile_based: past bij cuisine/USPs/sfeer. seasonal: past bij huidig seizoen.',
          },
          reasoning: {
            type: 'string',
            description:
              'Eén zin Nederlands waarom dit gerecht past bij DIT restaurant. Verwijs concreet naar het bestaande menu of profiel.',
            maxLength: 200,
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: [
          'name',
          'description',
          'category',
          'price_cents_low',
          'price_cents_high',
          'source_type',
          'reasoning',
          'confidence',
        ],
      },
    },
  },
  required: ['suggestions'],
} as const satisfies Anthropic.Tool.InputSchema;

type GeneratedSuggestion = {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  price_cents_low: number;
  price_cents_high: number;
  dietary_tags?: string[];
  source_type: 'gap_analysis' | 'profile_based' | 'seasonal';
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
};

type GenerateResult = {
  suggestions: GeneratedSuggestion[];
};

// Schema voor de refine-call: één voorstel als variant.
const REFINE_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 80 },
    description: { type: 'string', maxLength: 240 },
    category: { type: 'string' },
    subcategory: { type: 'string' },
    price_cents_low: { type: 'number' },
    price_cents_high: { type: 'number' },
    dietary_tags: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string', maxLength: 200 },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'name',
    'description',
    'category',
    'price_cents_low',
    'price_cents_high',
    'reasoning',
    'confidence',
  ],
} as const satisfies Anthropic.Tool.InputSchema;

type RefinedSuggestion = Omit<GeneratedSuggestion, 'source_type'>;

// Wat de UI nodig heeft. Kolomvolgorde komt overeen met de DB.
export type SuggestedMenuItem = {
  id: string;
  source_type: 'gap_analysis' | 'profile_based' | 'seasonal' | 'refined';
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  price_cents_low: number | null;
  price_cents_high: number | null;
  dietary_tags: string[];
  reasoning: string | null;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'rejected' | 'refined_into' | 'expired';
  refined_from_id: string | null;
  refine_count: number;
  created_at: string;
};

const SUGGESTED_COLUMNS =
  'id, source_type, name, description, category, subcategory, price_cents_low, price_cents_high, dietary_tags, reasoning, confidence, status, refined_from_id, refine_count, created_at';

// Hoeveel dagen mogen pending voorstellen blijven staan? Daarna lazy
// op 'expired' gezet bij de eerstvolgende list-call zodat de UI
// alleen relevante voorstellen toont.
const PENDING_TTL_DAYS = 30;

// Cap op refines per origineel-suggestion. Voorkomt dat een eigenaar
// die "nog een variant" blijft drukken onbedoeld €1+ aan Claude-calls
// per suggestion verbrandt.
const MAX_REFINES_PER_SUGGESTION = 3;

// Hoe vaak een eigenaar maximaal de batch-generate mag draaien per
// kalenderdag. Sonnet 4.6 met ~3500 output-tokens kost een paar
// dubbeltjes per call; dit is bewust een "creatieve sparring-tool"
// voor chefs, niet iets om te spammen. Refines vallen buiten deze cap
// (hebben hun eigen MAX_REFINES_PER_SUGGESTION).
const GENERATE_LIMIT_PER_DAY = 1;

@Injectable()
export class MenuSuggestionsService {
  private readonly logger = new Logger(MenuSuggestionsService.name);

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly ai: AiService,
    // RestaurantContextService levert profile + menu blocks zodat
    // Filly weet welke USPs/sfeer/keukenstijl dit restaurant heeft
    // én welke gerechten er al staan (gat-analyse).
    private readonly context: RestaurantContextService,
    private readonly audit: AuditLogService,
  ) {}

  // ============================================================
  // LIST, voorstellen tonen, default pending
  // ============================================================
  // status='pending' (default) → de "Voorgesteld"-tab. Lazy expire:
  //   voorstellen ouder dan PENDING_TTL_DAYS krijgen status='expired'
  //   zodat de UI alleen actuele voorstellen ziet.
  // status='rejected' → de "Afgewezen"-tab. Geen lazy expire, een
  //   chef wil terug kunnen kijken wat ie eerder afwees, en eventueel
  //   alsnog accepteren.
  async list(
    restaurantId: string,
    status: 'pending' | 'rejected' = 'pending',
  ): Promise<SuggestedMenuItem[]> {
    if (status === 'pending') {
      const cutoff = new Date(
        Date.now() - PENDING_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Lazy-expire, niet-fataal als deze update faalt; de
      // selectiequery werkt sowieso, en een mislukte cleanup betekent
      // alleen dat oude voorstellen even blijven hangen.
      await this.supabase.client
        .from('suggested_menu_items')
        .update({ status: 'expired', acted_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending')
        .lt('created_at', cutoff);
    }

    // Voor de Afgewezen-tab pakken we alleen recente afwijzingen
    // (laatste 90 dagen), anders kan die lijst eindeloos groeien
    // en wordt 'ie onhanteerbaar voor zaken die maandenlang
    // voorstellen genereren.
    let query = this.supabase.client
      .from('suggested_menu_items')
      .select(SUGGESTED_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .eq('status', status);

    if (status === 'rejected') {
      const cutoff90 = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
      query = query.gte('created_at', cutoff90);
    }

    const { data, error } = await query
      .order('confidence', { ascending: false }) // high eerst
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as SuggestedMenuItem[];
  }

  // ============================================================
  // GENERATE, nieuwe voorstellen op basis van menu + profiel
  // ============================================================
  async generate(
    restaurantId: string,
    userId: string,
  ): Promise<SuggestedMenuItem[]> {
    // Stap 0, daily cap. Eén batch per kalenderdag per restaurant.
    // We kijken naar audit_log ipv suggested_menu_items zelf zodat
    // ook accepteren/verwijderen van gisteren's voorstellen geen
    // invloed heeft op vandaag's cap. Tijd-vergelijking in UTC zodat
    // 23:50-vs-00:10-edgecase consistent uitvalt.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: todaysGenerations, error: capErr } =
      await this.supabase.client
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('action', 'menu_suggestions_generated')
        .gte('created_at', startOfDay.toISOString());
    if (capErr) throw new InternalServerErrorException(capErr.message);

    if ((todaysGenerations ?? 0) >= GENERATE_LIMIT_PER_DAY) {
      throw new BadRequestException(
        'Je hebt vandaag al voorstellen gegenereerd. Filly is bewust een creatieve sparring-tool, geen oneindige bron, kom morgen terug voor nieuwe ideeën.',
      );
    }

    // Stap 1, drempel: minimaal 3 gerechten in menu zodat Filly een
    // basis heeft voor gat-analyse + tone-matching. Onder die drempel
    // krijgen we generieke "duidelijke comfort-food"-voorstellen
    // ipv echte aanvulling.
    const { count: menuCount, error: countErr } = await this.supabase.client
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true);
    if (countErr) throw new InternalServerErrorException(countErr.message);

    if (!menuCount || menuCount < 3) {
      throw new BadRequestException(
        'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
      );
    }

    // Stap 2, context. Profile + menu via dezelfde blocks die ook
    // de chat en campagne-flow gebruiken (consistente persona).
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const monthName = today.toLocaleString('nl-NL', { month: 'long' });
    const season = currentSeasonNL(today);

    const systemPrompt = `Je bent Filly, een AI-sparring-partner voor de chef van het hieronder beschreven restaurant. Hij drukt op "Vraag Filly om voorstellen" om EEN ANDERE INVALSHOEK te zien voor zijn menu, niet om automatisch z'n menu te laten vullen. Geef hem precies 3 voorstellen met elk een DUIDELIJK ANDERE invalshoek.

Je antwoord komt via de tool 'generate_menu_suggestions'.

Strategie voor variëteit, kies 3 invalshoeken die niet overlappen:
- gap_analysis: vul een GAT in het bestaande menu, bv. eigenaar heeft geen visgerecht / geen vegetarisch hoofd / geen kinder-optie / geen dessert. Refereer in 'reasoning' EXPLICIET naar wat er ontbreekt.
- profile_based: past bij cuisine_style + USPs + sfeer + doelgroep. Bv. een Frans bistrootje met lokaal-product-USP → suet-dessert met streekfruit.
- seasonal: huidig seizoen is ${season} (maand ${monthName}). Pak een gerecht met seizoens-ingrediënten of -bereiding.

Confidence, KRITISCH om correct in te vullen:
- 'high' = "Sterke match". Past logisch bij dit restaurant; veilige aanvulling die zo op het menu past.
- 'medium' = "Redelijke match". Zou kunnen werken, vraagt iets meer overtuiging van de chef.
- 'low' = "Out of the box". Een gewaagd, onverwacht of avontuurlijk voorstel, niet wat een chef zelf zou bedenken, juist daarom interessant. Probeer minimaal één voorstel met 'low' te maken zodat de chef écht iets nieuws ziet (een ongebruikelijke combinatie, een trend uit een andere keuken, een onverwacht ingrediënt). 'low' is hier POSITIEF; het betekent niet "twijfel".

Inhoudsregels:
- Schrijf alles in het Nederlands. Match de brand_tone uit het profiel (casual/professional/playful).
- Verzin NIET wat al op het menu staat. Lees MENU goed door, voorstel moet écht een toevoeging zijn, geen variant van een bestaand gerecht.
- Prijs als realistische range (low/high in centen) op basis van price_range van de onderneming.
- Beschrijving zoals 'ie op een echte menukaart staat: hoofdingrediënt + bereidingswijze. Géén marketingteksten als "heerlijk", "speciaal", "uniek".
- dietary_tags: alleen vullen als zeker. Bv. een gerecht met room is NIET lactose_free.
- reasoning (max 200 tekens): één zin waarom dit voorstel past, verwijs concreet naar profile of menu. Voor 'low'-voorstellen mag je hier juist benadrukken WAAROM het gewaagd is en welke gast het zou aanspreken.

Vandaag is ${todayIso}.

---
CONTEXT, alles wat je weet over deze onderneming:

${profileBlock}

${menuBlock}
---`;

    const userPrompt = `Geef 3 voorstellen met verschillende invalshoeken, minimaal één 'high' en idealiter één 'low' (out of the box) zodat de chef ook iets onverwachts ziet.`;

    const raw = await this.ai.generateStructured<GenerateResult>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 3500,
      toolName: 'generate_menu_suggestions',
      toolDescription:
        'Lever 3-5 nieuwe gerecht-voorstellen voor dit restaurant op basis van profiel, bestaand menu en huidig seizoen.',
      inputSchema: GENERATE_SUGGESTIONS_SCHEMA,
      meta: {
        restaurantId,
        userId,
        feature: 'menu_suggestions_generate',
      },
      // Cache de system-prompt, bij dezelfde zaak binnen 5 min
      // (bv. eigenaar drukt nogmaals na refine) krijgen we ~90%
      // korting op input-tokens.
      cacheSystem: true,
    });

    if (!raw.suggestions?.length) {
      throw new InternalServerErrorException(
        'Filly heeft geen voorstellen kunnen maken. Probeer het zo opnieuw.',
      );
    }

    // Stap 3, wegschrijven als pending-rijen. Bulk-insert; bij DB-fout
    // gaat alles tegelijk terug en krijgt de UI een nette foutmelding.
    const rows = raw.suggestions.map((s) => ({
      restaurant_id: restaurantId,
      source_type: s.source_type,
      name: s.name.trim().slice(0, 200),
      description: s.description?.trim() || null,
      category: s.category?.trim() || null,
      subcategory: s.subcategory?.trim() || null,
      price_cents_low: clampPrice(s.price_cents_low),
      price_cents_high: clampPrice(s.price_cents_high),
      dietary_tags: cleanDietaryTags(s.dietary_tags),
      reasoning: s.reasoning?.trim().slice(0, 500) || null,
      confidence: s.confidence,
      status: 'pending' as const,
    }));

    const { data: inserted, error: insErr } = await this.supabase.client
      .from('suggested_menu_items')
      .insert(rows)
      .select(SUGGESTED_COLUMNS);
    if (insErr) throw new InternalServerErrorException(insErr.message);

    // Audit: één rij per generate-batch, niet per voorstel, 5 voorstellen
    // ineens is één eigenaars-actie, niet 5 verschillende beslissingen.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_suggestions_generated',
      entity_type: 'suggested_menu_items',
      entity_id: null,
      payload: {
        count: inserted?.length ?? 0,
        sources: countBySourceType(rows),
      },
    });

    this.logger.log(
      `MenuSuggestions: ${inserted?.length ?? 0} voorstellen gegenereerd voor restaurant ${restaurantId}`,
    );

    return (inserted ?? []) as SuggestedMenuItem[];
  }

  // ============================================================
  // ACCEPT, voorstel → echt menu_item
  // ============================================================
  async accept(
    restaurantId: string,
    suggestionId: string,
    userId: string,
  ): Promise<{ menu_item_id: string }> {
    // Stap 1, voorstel ophalen + status-check. RLS dwingt al af dat
    // je alleen je eigen voorstellen ziet, maar status-validatie hier
    // zodat we een nette foutmelding kunnen geven ipv een silent insert.
    const { data: sugg, error: fetchErr } = await this.supabase.client
      .from('suggested_menu_items')
      .select(
        'id, status, name, description, category, subcategory, price_cents_low, price_cents_high, dietary_tags',
      )
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!sugg) throw new NotFoundException('Voorstel niet gevonden.');
    if (sugg.status !== 'pending') {
      throw new BadRequestException(
        `Dit voorstel is al ${translateStatus(sugg.status as string)}.`,
      );
    }

    // Stap 2, als prijs een range is, pak het midden als startwaarde.
    // Eigenaar kan 'm daarna in de menu-pagina aanpassen.
    const startPrice = midPrice(
      sugg.price_cents_low as number | null,
      sugg.price_cents_high as number | null,
    );

    // Stap 3, insert in menu_items.
    const { data: newItem, error: insErr } = await this.supabase.client
      .from('menu_items')
      .insert({
        restaurant_id: restaurantId,
        name: sugg.name,
        description: sugg.description,
        category: sugg.category,
        subcategory: sugg.subcategory,
        price_cents: startPrice,
        dietary_tags: sugg.dietary_tags ?? [],
      })
      .select('id')
      .single();
    if (insErr) throw new InternalServerErrorException(insErr.message);

    // Stap 4, voorstel markeren als accepted + FK naar nieuwe item.
    // Als deze update faalt staat er een dubbel item zonder back-ref;
    // niet ideaal maar het bestaande gerecht is wel toegevoegd,
    // eigenaar ziet 't gewoon en de UI re-fetcht alles.
    const { error: updErr } = await this.supabase.client
      .from('suggested_menu_items')
      .update({
        status: 'accepted',
        accepted_menu_item_id: newItem.id,
        acted_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId);
    if (updErr) {
      this.logger.warn(
        `Voorstel ${suggestionId} update faalde na succesvolle menu-insert: ${updErr.message}`,
      );
    }

    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_suggestion_accepted',
      entity_type: 'menu_item',
      entity_id: newItem.id as string,
      payload: { suggestion_id: suggestionId, name: sugg.name },
    });

    return { menu_item_id: newItem.id as string };
  }

  // ============================================================
  // REJECT, voorstel afwijzen (status='rejected')
  // ============================================================
  async reject(
    restaurantId: string,
    suggestionId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const { data: sugg, error: fetchErr } = await this.supabase.client
      .from('suggested_menu_items')
      .select('id, status, name')
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!sugg) throw new NotFoundException('Voorstel niet gevonden.');
    if (sugg.status !== 'pending') {
      throw new BadRequestException(
        `Dit voorstel is al ${translateStatus(sugg.status as string)}.`,
      );
    }

    const { error: updErr } = await this.supabase.client
      .from('suggested_menu_items')
      .update({ status: 'rejected', acted_at: new Date().toISOString() })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId);
    if (updErr) throw new InternalServerErrorException(updErr.message);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_suggestion_rejected',
      entity_type: 'suggested_menu_item',
      entity_id: suggestionId,
      payload: { name: sugg.name },
    });

    return { id: suggestionId };
  }

  // ============================================================
  // REFINE, vraag een variant van het voorstel
  // ============================================================
  // Filly krijgt het oorspronkelijke voorstel + alle eerdere refines
  // mee als context, met instructie "geef een wezenlijk andere kant
  // op". Resultaat: nieuwe pending-rij met source_type='refined' en
  // refined_from_id-keten naar het origineel.
  async refine(
    restaurantId: string,
    suggestionId: string,
    userId: string,
  ): Promise<SuggestedMenuItem> {
    const { data: original, error: fetchErr } = await this.supabase.client
      .from('suggested_menu_items')
      .select(
        'id, status, name, description, category, subcategory, price_cents_low, price_cents_high, dietary_tags, reasoning, refined_from_id, refine_count, source_type',
      )
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if (!original) throw new NotFoundException('Voorstel niet gevonden.');
    if (original.status !== 'pending') {
      throw new BadRequestException(
        `Dit voorstel is al ${translateStatus(original.status as string)}.`,
      );
    }

    // Bepaal het wortel-voorstel (origineel) zodat we ook bij een
    // refine-van-een-refine de cap correct toepassen.
    const rootId = (original.refined_from_id as string | null) ?? original.id;
    const { count: refineCount, error: countErr } = await this.supabase.client
      .from('suggested_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('refined_from_id', rootId);
    if (countErr) throw new InternalServerErrorException(countErr.message);

    if ((refineCount ?? 0) >= MAX_REFINES_PER_SUGGESTION) {
      throw new BadRequestException(
        `Je hebt al ${MAX_REFINES_PER_SUGGESTION} varianten van dit voorstel bekeken. Accepteer er één of vraag een nieuw voorstel.`,
      );
    }

    // Context bouwen.
    const [profileBlock, menuBlock] = await Promise.all([
      this.context.buildProfileBlock(restaurantId).catch(() => ''),
      this.context.buildMenuBlock(restaurantId).catch(() => ''),
    ]);

    // Verzamel ook eerdere refines (zelfde root) zodat Filly geen
    // dubbel voorstel uitspuugt dat al is gegenereerd.
    const { data: siblings } = await this.supabase.client
      .from('suggested_menu_items')
      .select('name, description')
      .eq('restaurant_id', restaurantId)
      .or(`id.eq.${rootId},refined_from_id.eq.${rootId}`)
      .neq('id', suggestionId)
      .order('created_at', { ascending: true });

    const previousList = (siblings ?? [])
      .map(
        (s) =>
          `- ${s.name as string}${s.description ? `: ${s.description as string}` : ''}`,
      )
      .join('\n');

    const today = new Date();
    const season = currentSeasonNL(today);

    const systemPrompt = `Je bent Filly, een AI-assistent voor het hieronder beschreven restaurant. De eigenaar bekeek dit voorstel en wil een wezenlijk ANDERE variant.

Je antwoord komt via de tool 'refine_menu_suggestion' met één voorstel.

Inhoudsregels:
- Schrijf alles in het Nederlands. Match de brand_tone.
- VERMIJD de hoofdingrediënt en bereidingswijze van het oorspronkelijke voorstel, eigenaar zoekt iets anders.
- Verzin NIET wat al op het menu staat (zie MENU).
- Prijs realistisch op basis van de onderneming's price_range.
- reasoning: 1 zin waarom DEZE variant beter past dan het oorspronkelijke voorstel.
- Huidig seizoen: ${season}.

OORSPRONKELIJK VOORSTEL (vermijd vergelijkbare invulling):
- Naam: ${original.name as string}
- Beschrijving: ${(original.description as string | null) ?? '—'}
- Categorie: ${(original.category as string | null) ?? '—'}
- Reden destijds: ${(original.reasoning as string | null) ?? '—'}

${previousList ? `EERDERE VARIANTEN die je AL hebt voorgesteld (verzin niet hetzelfde):\n${previousList}\n` : ''}
---
CONTEXT, alles wat je weet over deze onderneming:

${profileBlock}

${menuBlock}
---`;

    const userPrompt = `Geef één wezenlijk andere variant op dit voorstel.`;

    const raw = await this.ai.generateStructured<RefinedSuggestion>({
      system: systemPrompt,
      prompt: userPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      toolName: 'refine_menu_suggestion',
      toolDescription:
        'Lever één wezenlijk andere variant op een eerder gegenereerd menu-voorstel.',
      inputSchema: REFINE_SUGGESTION_SCHEMA,
      meta: {
        restaurantId,
        userId,
        feature: 'menu_suggestions_refine',
      },
      cacheSystem: false, // unieke context per call (origineel + siblings)
    });

    // Nieuwe rij. source_type='refined' + FK naar root zodat alle
    // varianten visueel gegroepeerd kunnen worden in de UI later.
    const { data: newRow, error: insErr } = await this.supabase.client
      .from('suggested_menu_items')
      .insert({
        restaurant_id: restaurantId,
        source_type: 'refined' as const,
        name: raw.name.trim().slice(0, 200),
        description: raw.description?.trim() || null,
        category: raw.category?.trim() || null,
        subcategory: raw.subcategory?.trim() || null,
        price_cents_low: clampPrice(raw.price_cents_low),
        price_cents_high: clampPrice(raw.price_cents_high),
        dietary_tags: cleanDietaryTags(raw.dietary_tags),
        reasoning: raw.reasoning?.trim().slice(0, 500) || null,
        confidence: raw.confidence,
        status: 'pending' as const,
        refined_from_id: rootId,
        refine_count: (refineCount ?? 0) + 1,
      })
      .select(SUGGESTED_COLUMNS)
      .single();
    if (insErr) throw new InternalServerErrorException(insErr.message);

    // Het oude voorstel markeren als refined_into zodat de UI 'm uit
    // de "actieve voorstellen"-lijst kan halen, eigenaar werkt nu
    // met de nieuwe variant.
    const { error: oldUpdErr } = await this.supabase.client
      .from('suggested_menu_items')
      .update({
        status: 'refined_into',
        acted_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)
      .eq('restaurant_id', restaurantId);
    if (oldUpdErr) {
      this.logger.warn(
        `Voorstel ${suggestionId} kon niet op refined_into gezet: ${oldUpdErr.message}`,
      );
    }

    await this.audit.log({
      restaurantId,
      userId,
      action: 'menu_suggestion_refined',
      entity_type: 'suggested_menu_item',
      entity_id: newRow.id as string,
      payload: {
        original_id: suggestionId,
        root_id: rootId,
        refine_index: (refineCount ?? 0) + 1,
      },
    });

    return newRow as SuggestedMenuItem;
  }
}

// ============================================================
// Helpers
// ============================================================

function clampPrice(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null;
  if (v > 100_000_00) return 100_000_00; // 100k euro cap
  return Math.round(v);
}

function midPrice(
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (low != null && high != null && high >= low) {
    return Math.round((low + high) / 2);
  }
  return low ?? high ?? null;
}

function cleanDietaryTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 50),
    ),
  ).slice(0, 20);
}

function currentSeasonNL(d: Date): string {
  const m = d.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return 'lente';
  if (m >= 5 && m <= 7) return 'zomer';
  if (m >= 8 && m <= 10) return 'herfst';
  return 'winter';
}

function translateStatus(s: string): string {
  switch (s) {
    case 'accepted':
      return 'geaccepteerd';
    case 'rejected':
      return 'afgewezen';
    case 'refined_into':
      return 'vervangen door een variant';
    case 'expired':
      return 'verlopen';
    default:
      return s;
  }
}

function countBySourceType(
  rows: { source_type: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.source_type] = (out[r.source_type] ?? 0) + 1;
  }
  return out;
}
