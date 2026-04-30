import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AiService } from './ai.service';

// ============================================================
// MenuImporterService — Vision-analyse van een menukaart
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
// Eenmalig per restaurant (of bij heropen) — dus totaal peanuts.
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
  allergens?: string[];
};

export type ExtractedMenu = {
  items: ExtractedMenuItem[];
  categories_detected: string[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
};

@Injectable()
export class MenuImporterService {
  private readonly logger = new Logger(MenuImporterService.name);

  constructor(private readonly ai: AiService) {}

  async analyze(
    file: { buffer: Buffer; mimeType: string; originalName?: string },
    meta: { restaurantId: string | null; userId?: string },
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
        'Dit bestand is erg klein — mogelijk corrupt of leeg.',
      );
    }

    const base64 = file.buffer.toString('base64');

    // Tool-use met expliciet schema garandeert geldige output: geen
    // JSON.parse-fouten meer op markdown-codeblok-resten of trailing
    // comma's. De Anthropic API valideert het schema vóór de respons
    // bij ons aankomt.
    const raw = await this.ai.generateStructuredFromFile<RawMenuFromTool>({
      system: this.buildSystemPrompt(),
      instruction:
        'Dit is de menukaart. Vul de tool-args in met alle zichtbare gerechten.',
      file: { base64, mimeType: mime },
      // Opus 4.7: menu's hebben vaak complexe layouts (kolommen,
      // groeperingen, kleine lettertjes). Opus is hier merkbaar beter.
      model: 'claude-opus-4-7',
      maxTokens: 8000, // genoeg voor ~50-80 gerechten + tool-overhead
      toolName: 'extract_menu_items',
      toolDescription:
        'Extract alle gerechten van de meegeleverde menukaart als gestructureerde lijst.',
      inputSchema: MENU_EXTRACTION_SCHEMA,
      meta: {
        restaurantId: meta.restaurantId,
        userId: meta.userId,
        feature: 'menu_vision',
      },
    });

    return coerceMenu(raw);
  }

  private buildSystemPrompt(): string {
    return `Je bent Filly. Je kijkt naar een foto of PDF van een menukaart en extraheert alle gerechten.

Je antwoord komt via de tool 'extract_menu_items'. Het schema bepaalt de structuur — jij bepaalt wat je ziet.

Inhoudsregels:
- Alle tekst in het Nederlands, ongeacht taal van het menu. Als het menu Engels is, vertaal je namen naar NL waar natuurlijk (bv. 'Chicken' → 'Kip'), behoud originele fantasienamen ('Carpaccio', 'Tiramisu').
- price_cents = integer. €12,50 = 1250. €12 = 1200. Geen decimalen. Geen prijs op de kaart = veld weglaten, NIET raden.
- Allergens: alleen als legenda of icoontje op de kaart staat. Standaard EU-codes (A=gluten, B=schaaldieren, C=ei, ...) of volledige namen (gluten, noten, melk). Leeg = geen expliciete aanduiding.
- Verzin GEEN gerechten. Als tekst onleesbaar is, noteer in "notes" welk deel onduidelijk was.
- Categorie-keuze (verplicht, kies één van de 6):
    * "voorgerecht"  — voorgerechten, starters, amuses, borrelhappen
    * "tussen"       — tussengerechten / middelgerechten (klassiek menu)
    * "hoofd"        — hoofdgerechten, vis-/vlees-/vega-mains, pasta, pizza, salades, bijgerechten
    * "dessert"      — nagerechten, zoete afsluiters, kaasplanken
    * "drank"        — wijnen, bieren, cocktails, koffie/thee, alcoholvrij
    * "overig"       — alles wat niet in bovenstaande 5 past (gebruik dit spaarzaam)
- Gerechten die duidelijk een variant zijn (bv. "met biefstuk €18, met zalm €16"): 2 items maken.
- Als het bestand geen menukaart lijkt maar iets anders: geef een lege items-array en zet notes = "Dit lijkt geen menukaart te zijn".`;
  }
}

// ============================================================
// JSON-schema voor extract_menu_items (tool-use)
// ============================================================
// category-enum sluit aan op de 6 UI-tabs op /dashboard/menu
// (voorgerecht / tussen / hoofd / dessert / drank / overig).
// Claude kan dus geen "voor", "tussen", "hoofdgerechten" of
// andere variaties returnen — de Anthropic API valideert het
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

type RawMenuFromTool = {
  items: Array<{
    name: string;
    description?: string;
    price_cents?: number;
    category?: string;
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

function coerceMenu(raw: RawMenuFromTool): ExtractedMenu {
  const items: ExtractedMenuItem[] = [];
  for (const it of raw.items) {
    const cleaned = coerceMenuItem(it);
    if (cleaned) items.push(cleaned);
  }

  return {
    items,
    categories_detected: (raw.categories_detected ?? [])
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
    confidence: raw.confidence,
    notes:
      raw.notes && raw.notes.trim().length > 0 ? raw.notes.trim() : undefined,
  };
}

function coerceMenuItem(it: RawMenuFromTool['items'][number]): ExtractedMenuItem | null {
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

  const category =
    it.category && it.category.trim().length > 0
      ? it.category.trim().toLowerCase()
      : undefined;

  const allergens = (it.allergens ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  return {
    name,
    description,
    price_cents: price,
    category,
    allergens: allergens.length > 0 ? allergens : undefined,
  };
}
