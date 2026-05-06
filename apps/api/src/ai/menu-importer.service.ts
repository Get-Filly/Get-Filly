import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AiService } from './ai.service';

// ============================================================
// MenuImporterService, Vision-analyse van een menukaart
// ============================================================
// Accepteert een PDF of foto en laat Claude Opus 4.7 de gerechten
// extraheren. Retourneert een gestructureerde lijst die direct als
// menu_items-rijen geïnsert kan worden.
//
// Opus (duurder maar veel capabeler in visuele layout-analyse):
//   - Herkent kolom-indelingen
//   - Groepeert gerechten in de juiste categorie (voor/hoofd/nagerecht)
//   - Pakt prijzen ook in weird notaties ("€12,50", "12.50", "12,-")
//   - Detecteert allergenen-codes als ze in legenda staan
// Kosten: ~€0,15-0,30 per menu afhankelijk van pagina's en detail.
// Eenmalig per restaurant (of bij heropen), dus totaal peanuts.
// ============================================================

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// Limiet op bestands-grootte. Claude accepteert tot ~32MB voor PDF,
// maar op onze kant is 10MB ruim genoeg voor een menu-kaart.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export type ExtractedMenuItem = {
  name: string;
  description?: string;
  price_cents?: number;
  category?: string;
  // Sub-categorie. Voor drankkaart: wijn-rood, wijn-wit, bier, etc.
  // Voor reguliere menukaart momenteel ongebruikt.
  subcategory?: string;
  allergens?: string[];
};

export type ExtractedMenu = {
  items: ExtractedMenuItem[];
  categories_detected: string[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
};

// Wat voor type kaart we analyseren. Bepaalt welke prompt + welk
// JSON-schema Claude krijgt:
//   - 'menu'   → reguliere menukaart, category-enum [voorgerecht..]
//   - 'drinks' → drankkaart, alle items category='drank',
//                subcategory-enum [wijn-rood, bier, ..]
export type CardKind = 'menu' | 'drinks';

@Injectable()
export class MenuImporterService {
  private readonly logger = new Logger(MenuImporterService.name);

  constructor(private readonly ai: AiService) {}

  async analyze(
    file: { buffer: Buffer; mimeType: string; originalName?: string },
    meta: { restaurantId: string | null; userId?: string },
    kind: CardKind = 'menu',
  ): Promise<ExtractedMenu> {
    // Input-validatie. Beter hier vangen dan pas bij Claude met een
    // cryptische fout.
    const mime = file.mimeType.toLowerCase();
    if (!SUPPORTED_MIME_TYPES.has(mime)) {
      throw new BadRequestException(
        `Bestandstype ${mime} wordt niet ondersteund. Gebruik PDF, JPEG, PNG of WebP.`,
      );
    }
    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Bestand is te groot (${Math.round(file.buffer.length / 1024 / 1024)}MB). Maximaal 10MB.`,
      );
    }
    if (file.buffer.length < 1024) {
      throw new BadRequestException(
        'Dit bestand is erg klein, mogelijk corrupt of leeg.',
      );
    }

    const base64 = file.buffer.toString('base64');

    // Tool-use met expliciet schema garandeert geldige output: geen
    // JSON.parse-fouten meer op markdown-codeblok-resten of trailing
    // comma's. De Anthropic API valideert het schema vóór de respons
    // bij ons aankomt.
    const isDrinks = kind === 'drinks';
    const raw = await this.ai.generateStructuredFromFile<RawMenuFromTool>({
      system: isDrinks ? buildDrinksSystemPrompt() : buildMenuSystemPrompt(),
      instruction: isDrinks
        ? 'Dit is de drankkaart. Vul de tool-args in met alle zichtbare drankjes.'
        : 'Dit is de menukaart. Vul de tool-args in met alle zichtbare gerechten.',
      file: { base64, mimeType: mime },
      // Opus 4.7: menu/drank-kaarten hebben vaak complexe layouts
      // (kolommen, groeperingen, kleine lettertjes). Opus is hier
      // merkbaar beter.
      model: 'claude-opus-4-7',
      // Per-kind cap: drankkaarten hebben vaak 100+ items met
      // descriptions (druif/regio/jaargang per wijn) en raken bij
      // 16k de cap. Menu-kaarten zijn doorgaans 30-60 items en
      // passen ruim in 16k.
      // Caps zijn cap, géén gegarandeerd verbruik, kleine kaarten
      // kosten niet meer omdat de cap hoger staat.
      maxTokens: isDrinks ? 24000 : 16000,
      toolName: isDrinks ? 'extract_drink_items' : 'extract_menu_items',
      toolDescription: isDrinks
        ? 'Extract alle drankjes van de meegeleverde drankkaart als gestructureerde lijst, met subcategorie (wijn-rood, bier, etc).'
        : 'Extract alle gerechten van de meegeleverde menukaart als gestructureerde lijst.',
      inputSchema: isDrinks
        ? DRINK_EXTRACTION_SCHEMA
        : MENU_EXTRACTION_SCHEMA,
      meta: {
        restaurantId: meta.restaurantId,
        userId: meta.userId,
        feature: isDrinks ? 'drinks_vision' : 'menu_vision',
      },
    });

    return coerceMenu(raw, kind);
  }
}

// ============================================================
// System prompt voor reguliere menukaart
// ============================================================
function buildMenuSystemPrompt(): string {
  return `Je bent Filly. Je kijkt naar een foto of PDF van een menukaart en extraheert alle gerechten.

Je antwoord komt via de tool 'extract_menu_items'. Het schema bepaalt de structuur, jij bepaalt wat je ziet.

Inhoudsregels:
- Alle tekst in het Nederlands, ongeacht taal van het menu. Als het menu Engels is, vertaal je namen naar NL waar natuurlijk (bv. 'Chicken' → 'Kip'), behoud originele fantasienamen ('Carpaccio', 'Tiramisu').
- price_cents = integer. €12,50 = 1250. €12 = 1200. Geen decimalen. Geen prijs op de kaart = veld weglaten, NIET raden.
- Allergens: alleen als legenda of icoontje op de kaart staat. Standaard EU-codes (A=gluten, B=schaaldieren, C=ei, ...) of volledige namen (gluten, noten, melk). Leeg = geen expliciete aanduiding.
- Verzin GEEN gerechten. Als tekst onleesbaar is, noteer in "notes" welk deel onduidelijk was.
- Categorie-keuze (verplicht, kies één van de 6):
    * "voorgerecht" , voorgerechten, starters, amuses, borrelhappen
    * "tussen"      , tussengerechten / middelgerechten (klassiek menu)
    * "hoofd"       , hoofdgerechten, vis-/vlees-/vega-mains, pasta, pizza, salades, bijgerechten
    * "dessert"     , nagerechten, zoete afsluiters, kaasplanken
    * "drank"       , wijnen, bieren, cocktails, koffie/thee, alcoholvrij (NB: drankkaarten worden via een aparte upload-flow ingelezen, als deze upload alleen drankjes bevat, gebruik dan toch category=drank)
    * "overig"      , alles wat niet in bovenstaande 5 past (gebruik dit spaarzaam)
- Gerechten die duidelijk een variant zijn (bv. "met biefstuk €18, met zalm €16"): 2 items maken.
- Als het bestand geen menukaart lijkt maar iets anders: geef een lege items-array en zet notes = "Dit lijkt geen menukaart te zijn".`;
}

// ============================================================
// System prompt voor drankkaart
// ============================================================
function buildDrinksSystemPrompt(): string {
  return `Je bent Filly. Je kijkt naar een foto of PDF van een DRANKKAART en extraheert alle drankjes.

Je antwoord komt via de tool 'extract_drink_items'. Het schema bepaalt de structuur, jij bepaalt wat je ziet.

Inhoudsregels:
- Alle tekst in het Nederlands, ongeacht taal van de kaart. Behoud originele namen voor wijnen ('Sancerre', 'Barolo'), bieren ('Tripel Karmeliet') en cocktails ('Negroni').
- price_cents = integer in centen. €4,50 = 450. €12 = 1200. Geen decimalen. Geen prijs = veld weglaten, NIET raden. Bij dranken die per glas én per fles verkocht worden: kies de prijs-per-glas (de gebruikelijke "drink-prijs") en zet de fles-info in description (bv. "fles €38").
- Verzin GEEN drankjes. Als tekst onleesbaar is, noteer in "notes" welk deel onduidelijk was.
- Subcategorie-keuze (verplicht, kies één van de 10):
    * "wijn-rood"       , rode wijnen
    * "wijn-wit"        , witte wijnen
    * "wijn-rose"       , rosé-wijnen
    * "wijn-mousserend" , champagne, prosecco, cava, crémant en andere bubbels
    * "bier"            , pils, tap-/fles-bieren, speciaalbieren
    * "cocktail"        , gemixte cocktails (Negroni, Aperol Spritz, etc.)
    * "sterke-drank"    , gin, whisky, rum, jenever, port, sherry, likeur
    * "koffie-thee"     , koffie, thee, warme dranken
    * "fris"            , frisdranken, sappen, water, alcoholvrij
    * "overig"          , alles wat niet in bovenstaande 9 past (gebruik dit spaarzaam)
- description: KORT EN COMPACT, max 60 tekens, geen volzinnen.
    * Wijn: druif + regio + jaargang ('Pinot Noir, Bourgogne 2021', 'Sangiovese, Toscane 2020').
    * Bier: stijl + alc ('blond, 6,5%', 'IPA, 7%').
    * Cocktail: 2-3 hoofdingrediënten ('gin, tonic, citroen').
    * Niet vermelden in welke sectie van de kaart 'm staat, sectie-info hoort niet in description.
- Als een wijn in meerdere secties staat (by-the-glass + flessenkaart): pak 'm 1× op met de prijs-per-glas. Vermeld fles-prijs alleen als die uniek is voor de fles-sectie.
- Als het bestand geen drankkaart lijkt maar iets anders: geef een lege items-array en zet notes = "Dit lijkt geen drankkaart te zijn".`;
}

// ============================================================
// JSON-schema voor extract_menu_items (tool-use)
// ============================================================
// category-enum sluit aan op de 6 UI-tabs op /dashboard/menu
// (voorgerecht / tussen / hoofd / dessert / drank / overig).
// Claude kan dus geen "voor", "tussen", "hoofdgerechten" of
// andere variaties returnen, de Anthropic API valideert het
// schema, dus afwijkingen komen sowieso niet bij ons aan.
const MENU_CATEGORIES = [
  'voorgerecht',
  'tussen',
  'hoofd',
  'dessert',
  'drank',
  'overig',
] as const;

const MENU_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price_cents: { type: 'integer' },
          category: {
            type: 'string',
            enum: MENU_CATEGORIES,
          },
          allergens: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'category'],
      },
    },
    categories_detected: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    notes: { type: 'string' },
  },
  required: ['items', 'confidence'],
} as const satisfies Anthropic.Tool.InputSchema;

// ============================================================
// JSON-schema voor extract_drink_items (drankkaart tool-use)
// ============================================================
// Subcategory-enum sluit aan op de visuele groepering binnen de
// "drank"-tab op /dashboard/menu. Category zelf zit niet in dit
// schema, server-side forceren we 'm op 'drank' (alle items van
// een drankkaart belanden per definitie in die tab).
const DRINK_SUBCATEGORIES = [
  'wijn-rood',
  'wijn-wit',
  'wijn-rose',
  'wijn-mousserend',
  'bier',
  'cocktail',
  'sterke-drank',
  'koffie-thee',
  'fris',
  'overig',
] as const;

const DRINK_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price_cents: { type: 'integer' },
          subcategory: {
            type: 'string',
            enum: DRINK_SUBCATEGORIES,
          },
        },
        required: ['name', 'subcategory'],
      },
    },
    categories_detected: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    notes: { type: 'string' },
  },
  required: ['items', 'confidence'],
} as const satisfies Anthropic.Tool.InputSchema;

type RawMenuFromTool = {
  items: Array<{
    name: string;
    description?: string;
    price_cents?: number;
    category?: string;
    subcategory?: string;
    allergens?: string[];
  }>;
  categories_detected?: string[];
  confidence: 'low' | 'medium' | 'high';
  notes?: string;
};

// ============================================================
// Post-processing: tool-use levert al gevalideerde JSON, maar we
// strippen lege strings, lowercasen categorieën en filteren items
// zonder naam (kunnen we toch niets mee in de DB).
// ============================================================

function coerceMenu(raw: RawMenuFromTool, kind: CardKind): ExtractedMenu {
  // Schema markeert items als required, maar Claude kan bij edge
  // cases (helemaal lege kaart, bestand niet leesbaar) een lege
  // array of geen veld terugsturen. Defensief naar [] coercen.
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items: ExtractedMenuItem[] = [];
  for (const it of rawItems) {
    const cleaned = coerceMenuItem(it, kind);
    if (cleaned) items.push(cleaned);
  }

  return {
    items,
    categories_detected: (raw?.categories_detected ?? [])
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
    // Confidence is required maar ook hier defensief, bij rare
    // tool-use-respons valt 'm terug op 'low'.
    confidence: raw?.confidence ?? 'low',
    notes:
      raw?.notes && raw.notes.trim().length > 0
        ? raw.notes.trim()
        : undefined,
  };
}

function coerceMenuItem(
  it: RawMenuFromTool['items'][number],
  kind: CardKind,
): ExtractedMenuItem | null {
  const name = it.name?.trim();
  if (!name) return null; // gerecht zonder naam is nutteloos

  const price =
    typeof it.price_cents === 'number' && Number.isFinite(it.price_cents)
      ? Math.round(it.price_cents)
      : undefined;

  const description =
    it.description && it.description.trim().length > 0
      ? it.description.trim()
      : undefined;

  // Bij drankkaart-import forceren we category='drank', alle items
  // van een drankkaart belanden per definitie in de drank-tab.
  // Bij menu-import gebruiken we wat Claude teruggaf.
  const category =
    kind === 'drinks'
      ? 'drank'
      : it.category && it.category.trim().length > 0
        ? it.category.trim().toLowerCase()
        : undefined;

  const subcategory =
    it.subcategory && it.subcategory.trim().length > 0
      ? it.subcategory.trim().toLowerCase()
      : undefined;

  const allergens = (it.allergens ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  return {
    name,
    description,
    price_cents: price,
    category,
    subcategory,
    allergens: allergens.length > 0 ? allergens : undefined,
  };
}
