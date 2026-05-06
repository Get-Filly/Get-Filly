import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AiService } from '../ai/ai.service';

// ============================================================
// MediaTaggerService, Vision-tag bij foto-upload
// ============================================================
//
// Wordt eenmalig per upload aangeroepen door RestaurantMediaService.
// Genereert een korte Nederlandse beschrijving + 3-5 tags die Filly
// later gebruikt om foto's voor te stellen bij campagne-creatie
// ("voor de pasta-campagne past foto X, beschrijving: ...").
//
// Cost-strategie: Haiku 4.5 Vision, ~€0.005 per foto. 20 foto's per
// restaurant = €0.10 eenmalig. Geen runtime-cost tijdens campagnes
// omdat de tekst opgeslagen blijft in restaurant_media.description.
// ============================================================

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description:
        'Beknopte Nederlandse beschrijving van de foto (max 150 tekens). ' +
        'Beschrijf wat er feitelijk te zien is, geen marketingfluff. ' +
        'Bv. "Pasta carbonara met spek en parmezaan op een houten tafel" of ' +
        '"Buitenkant van het terras met tafels in de avondzon".',
      maxLength: 200,
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 6,
      description:
        'Korte trefwoorden voor matching. Kies uit categorieën: ' +
        '"gerecht", "drank", "interieur", "exterieur", "team", "event", ' +
        '"sfeer", "terras", "bar". Plus 1-3 specifieke tags zoals ' +
        '"pasta", "wijn-rood", "kerstdiner", "winter", "vegetarisch". ' +
        'Geen merken of namen.',
    },
  },
  required: ['description', 'tags'],
} as const satisfies Anthropic.Tool.InputSchema;

export type MediaTagResult = {
  description: string;
  tags: string[];
};

@Injectable()
export class MediaTaggerService {
  private readonly logger = new Logger(MediaTaggerService.name);

  constructor(private readonly ai: AiService) {}

  // Foto → description + tags. Bij Claude-fout returnen we lege defaults
  // zodat de upload niet faalt, eigenaar kan handmatig een description
  // bewerken later (TODO: edit-flow op restaurant_media).
  async tag(
    file: { buffer: Buffer; mimeType: string },
    meta: { restaurantId: string; userId?: string },
  ): Promise<MediaTagResult> {
    try {
      const result = await this.ai.generateStructuredFromFile<MediaTagResult>({
        system:
          'Je bent een Nederlandse beeld-tagger voor een restaurant-marketingplatform. ' +
          'Je krijgt foto\'s van restaurants (gerechten, interieur, team, events) en ' +
          'genereert een feitelijke beschrijving + tags zodat Filly later foto\'s kan ' +
          'voorstellen die passen bij specifieke campagnes.',
        instruction:
          'Beschrijf deze restaurant-foto en geef tags. Houd de beschrijving feitelijk ' +
          '(geen marketingteksten als "heerlijk" of "uniek"). Tags moeten matching ' +
          'tussen campagne-thema en foto vergemakkelijken.',
        file: {
          base64: file.buffer.toString('base64'),
          mimeType: file.mimeType,
        },
        toolName: 'tag_restaurant_photo',
        toolDescription:
          'Lever een Nederlandse beschrijving + tags voor een restaurant-foto.',
        inputSchema: TAG_SCHEMA,
        // Haiku 4.5 voor cost, beeld-tagging is geen high-stakes redenering.
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 250,
        meta: {
          restaurantId: meta.restaurantId,
          userId: meta.userId,
          feature: 'media_tagger',
        },
      });

      // Cleanup: trim + dedupe + cap. Beschermt tegen rare AI-output.
      return {
        description:
          result.description?.trim().slice(0, 200) ?? '',
        tags: Array.from(
          new Set(
            (result.tags ?? [])
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim().toLowerCase())
              .filter((t) => t.length > 0 && t.length <= 30),
          ),
        ).slice(0, 6),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `MediaTagger faalde voor restaurant ${meta.restaurantId}: ${msg}`,
      );
      // Fail-soft: lege defaults zodat de upload zelf wel slaagt.
      return { description: '', tags: [] };
    }
  }
}
