import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ============================================================
// outscraper.client.ts — dunne Outscraper-API-client
// ============================================================
// Haalt Google "Populaire tijden" op via /google-maps-search. Eén key
// (OUTSCRAPER_API_KEY) voor alle restaurants; per zaak 1 call met hun
// place_id. Geen enrichments (die kosten geld; popular_times zit gratis
// in de basis-Places-data en komt alleen terug bij enkele-plek-queries).
//
// Async-gedrag: standaard geeft Outscraper 202 + results_location terug.
// Bij async=false + 1 plek komt het resultaat meestal direct (seconden);
// krijgen we tóch een 202, dan pollen we results_location kort (binnen
// vercel.json maxDuration: 60).

export interface OutscraperPlace {
  place_id?: string;
  name?: string;
  time_zone?: string;
  popular_times?: unknown; // door parsePopularTimes verwerkt
  working_hours?: unknown; // door parseWorkingHours verwerkt
  raw: Record<string, unknown>; // volledige rij, voor de raw-kolom
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class OutscraperClient {
  private readonly logger = new Logger(OutscraperClient.name);
  private readonly base = 'https://api.outscraper.com';

  constructor(private readonly config: ConfigService) {}

  private key(): string {
    const k = this.config.get<string>('OUTSCRAPER_API_KEY');
    if (!k) {
      throw new ServiceUnavailableException(
        'OUTSCRAPER_API_KEY ontbreekt in de env.',
      );
    }
    return k;
  }

  /**
   * Haalt één plek op aan de hand van een Google place_id. Retourneert
   * null als Outscraper niets teruggaf (dan valt de caller terug op seed).
   */
  async fetchPlace(placeId: string): Promise<OutscraperPlace | null> {
    const url = new URL(`${this.base}/google-maps-search`);
    url.searchParams.set('query', placeId);
    url.searchParams.set('limit', '1');
    url.searchParams.set('region', 'NL');
    url.searchParams.set('async', 'false');

    const res = await fetch(url, { headers: { 'X-API-KEY': this.key() } });

    if (res.status === 202) {
      const body = (await res.json()) as { results_location?: string };
      return this.pollResults(body?.results_location);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Outscraper ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return this.extractFirst(await res.json());
  }

  // Poll results_location tot de taak klaar is (~max 45s, 5s-interval).
  private async pollResults(
    location?: string,
  ): Promise<OutscraperPlace | null> {
    if (!location) return null;
    for (let i = 0; i < 9; i++) {
      await sleep(5000);
      const res = await fetch(location, {
        headers: { 'X-API-KEY': this.key() },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { status?: string };
      const status = body?.status;
      if (status === 'Success' || status === 'Finished') {
        return this.extractFirst(body);
      }
      if (status === 'Error' || status === 'Failed') {
        throw new ServiceUnavailableException(
          `Outscraper-taak faalde: ${status}`,
        );
      }
    }
    this.logger.warn('Outscraper-poll time-out (>45s), geen resultaat.');
    return null;
  }

  // Respons-vorm: { data: [[ {plek}, ... ], ...] } — genest per query.
  private extractFirst(body: unknown): OutscraperPlace | null {
    const data = (body as { data?: unknown })?.data;
    let place: unknown = null;
    if (Array.isArray(data)) {
      place = Array.isArray(data[0]) ? data[0][0] : data[0];
    }
    if (!place || typeof place !== 'object') return null;
    const p = place as Record<string, unknown>;
    return {
      place_id: p.place_id as string | undefined,
      name: p.name as string | undefined,
      time_zone: p.time_zone as string | undefined,
      popular_times: p.popular_times,
      working_hours: p.working_hours,
      raw: p,
    };
  }
}
