import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApifyPlace } from './apify.parser';

// ============================================================
// apify.client.ts — Apify Google Maps-scraper (compass actor)
// ============================================================
// VERVANGT de Outscraper-client. Apify scrapet echt vers (Outscraper
// cachete de live-drukte). We halen ALLE place_ids in ÉÉN run op
// (batched) i.p.v. één call per zaak — een run duurt ~15-90s, dus per
// zaak bellen zou traag + duur zijn.
//
// Endpoint: run-sync-get-dataset-items draait de actor en geeft de
// dataset-items direct terug. "Scrape place detail page" AAN → levert
// popularTimesHistogram + popularTimesLivePercent + openingHours.

@Injectable()
export class ApifyClient {
  private readonly logger = new Logger(ApifyClient.name);
  private readonly actor = 'compass~crawler-google-places';
  private readonly base = 'https://api.apify.com/v2';

  constructor(private readonly config: ConfigService) {}

  private token(): string {
    const t = this.config.get<string>('APIFY_TOKEN');
    if (!t) {
      throw new ServiceUnavailableException('APIFY_TOKEN ontbreekt in de env.');
    }
    return t;
  }

  /**
   * Haalt meerdere plekken in één run op. Retourneert een map place_id →
   * plek, zodat de caller elk resultaat aan het juiste restaurant koppelt.
   * Lege input → lege map.
   */
  async fetchPlaces(placeIds: string[]): Promise<Map<string, ApifyPlace>> {
    const ids = [...new Set(placeIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const url = `${this.base}/acts/${this.actor}/run-sync-get-dataset-items`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        placeIds: ids,
        scrapePlaceDetailPage: true, // nodig voor popular times + live
        maxCrawledPlacesPerSearch: ids.length,
        language: 'en', // labels als "Less busy than usual" — stabiel te parsen
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Apify ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const items = (await res.json()) as ApifyPlace[];
    const map = new Map<string, ApifyPlace>();
    for (const p of items ?? []) {
      // De actor geeft placeId terug; inputPlaceId als terugval.
      const id =
        p.placeId ?? (p as { inputPlaceId?: string }).inputPlaceId ?? null;
      if (id) map.set(id, p);
    }
    this.logger.log(`Apify: ${map.size}/${ids.length} plekken opgehaald.`);
    return map;
  }
}
