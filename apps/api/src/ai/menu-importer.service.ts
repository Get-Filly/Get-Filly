import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
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

    const raw = await this.ai.generateFromFile({
      system: this.buildSystemPrompt(),
      instruction:
        'Dit is de menukaart. Extract alle gerechten volgens het JSON-schema.',
      file: { base64, mimeType: mime },
      // Opus 4.7: menu's hebben vaak complexe layouts (kolommen,
      // groeperingen, kleine lettertjes). Opus is hier merkbaar beter.
      model: 'claude-opus-4-7',
      maxTokens: 6000, // genoeg voor ~50-80 gerechten
      meta: {
        restaurantId: meta.restaurantId,
        userId: meta.userId,
        feature: 'menu_vision',
      },
    });

    return parseMenu(raw);
  }

  private buildSystemPrompt(): string {
    return `Je bent Filly. Je kijkt naar een foto of PDF van een menukaart en extraheert alle gerechten.

Geef ALLEEN een JSON-object terug, zonder markdown-codeblok, zonder commentaar:

{
  "items": [
    {
      "name": "<naam van het gerecht>",
      "description": "<omschrijving indien aanwezig>",
      "price_cents": <prijs in centen, dus 1250 voor €12,50, weglaten als geen prijs>,
      "category": "<categorie zoals op de kaart: 'voorgerecht', 'hoofdgerecht', 'nagerecht', 'drank', 'wijn', 'bier', 'borrelhap', 'lunch', 'brunch', 'pizza', 'salade', enz. Gebruik de NL-termen die op de kaart staan.>",
      "allergens": ["<allergeen-code of woord>", ...]
    }
  ],
  "categories_detected": ["<alle categorieën die je op de kaart zag>"],
  "confidence": "<high | medium | low>",
  "notes": "<wat was onduidelijk, ontbrekende prijzen, etc. Leeg als alles duidelijk was.>"
}

Regels:
- Alle tekst in het Nederlands, ongeacht taal van het menu. Als het menu Engels is, vertaal je namen naar NL waar natuurlijk (bv. 'Chicken' → 'Kip'), behoud originele fantasienamen ('Carpaccio', 'Tiramisu').
- price_cents = integer. €12,50 = 1250. €12 = 1200. Geen decimalen. Geen prijs op de kaart = weglaten, NIET raden.
- Allergens: alleen als legenda of icoontje op de kaart staat. Standaard EU-codes (A=gluten, B=schaaldieren, C=ei, ...) of volledige namen (gluten, noten, melk). Leeg = geen expliciete aanduiding.
- Verzin GEEN gerechten. Als tekst onleesbaar is, noteer in "notes" welk deel onduidelijk was.
- Categorie-namen: blijf bij wat op de kaart staat. Als er geen kopjes zijn, gebruik "anders" of laat weg.
- Gerechten die duidelijk een variant zijn (bv. "met biefstuk €18, met zalm €16"): 2 items maken.
- Wijnkaart/drankenkaart meenemen als ze er staan — prijs per glas of per fles.
- Als het bestand geen menukaart lijkt maar iets anders: geef een lege items-array en zet notes = "Dit lijkt geen menukaart te zijn".`;
  }
}

// ============================================================
// Parsing helpers
// ============================================================

function parseMenu(raw: string): ExtractedMenu {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      items: [],
      categories_detected: [],
      confidence: 'low',
      notes: 'Kon Filly-antwoord niet als JSON parsen.',
    };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
    const items: ExtractedMenuItem[] = [];
    for (const raw of itemsRaw) {
      const it = asMenuItem(raw);
      if (it) items.push(it);
    }

    const categories =
      Array.isArray(parsed.categories_detected)
        ? parsed.categories_detected.filter(
            (c): c is string => typeof c === 'string',
          )
        : [];

    return {
      items,
      categories_detected: categories,
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium'
          ? parsed.confidence
          : 'low',
      notes:
        typeof parsed.notes === 'string' && parsed.notes.trim().length > 0
          ? parsed.notes.trim()
          : undefined,
    };
  } catch (err) {
    throw new InternalServerErrorException(
      `Kon Filly's antwoord niet lezen: ${String(err)}`,
    );
  }
}

function asMenuItem(v: unknown): ExtractedMenuItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return null; // gerecht zonder naam is nutteloos

  const price =
    typeof o.price_cents === 'number' && Number.isFinite(o.price_cents)
      ? Math.round(o.price_cents)
      : undefined;

  const description =
    typeof o.description === 'string' && o.description.trim().length > 0
      ? o.description.trim()
      : undefined;

  const category =
    typeof o.category === 'string' && o.category.trim().length > 0
      ? o.category.trim().toLowerCase()
      : undefined;

  const allergens = Array.isArray(o.allergens)
    ? o.allergens
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
    : undefined;

  return {
    name,
    description,
    price_cents: price,
    category,
    allergens: allergens && allergens.length > 0 ? allergens : undefined,
  };
}
