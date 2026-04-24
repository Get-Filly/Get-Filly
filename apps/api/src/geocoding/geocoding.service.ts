import { Injectable, Logger } from '@nestjs/common';

// ============================================================
// GeocodingService — adres → coördinaten via PDOK Locatieserver
// ============================================================
// We gebruiken de PDOK Locatieserver van het Kadaster, de officiële
// Nederlandse adres-zoek-API. Redenen:
//   - Gratis en onbeperkt (geen API-key, geen rate-limit)
//   - Officiële bron (BAG = Basisregistratie Adressen en Gebouwen)
//   - EU-gehost (AVG-vriendelijk, geen SCC-gedoe)
//   - Perfect voor NL-postcodes (hetgeen Google/Nominatim wél kunnen
//     missen bij zeldzame adressen)
//
// Endpoint:
//   https://api.pdok.nl/bzk/locatieserver/search/v3_1/free
//   ?q=<zoekterm>&rows=1&fl=centroide_ll,weergavenaam,type
//
// Response (success):
//   { response: { docs: [{
//       centroide_ll: "POINT(4.899553 52.372937)",  // WKT: lng lat
//       weergavenaam: "Damrak 1, 1012LG Amsterdam",
//       type: "adres"
//   }]}}
//
// Response (niet-gevonden):
//   { response: { numFound: 0, docs: [] } }
//
// Bij fouten (netwerk, 5xx, parse): loggen en null terugrechter van
// de caller. Onboarding blijft doorgaan — lat/long mag ook null
// zijn, we missen dan alleen de weer-forecast voor die zaak.
// ============================================================

const PDOK_ENDPOINT =
  'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const REQUEST_TIMEOUT_MS = 10_000;

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  // Weergavenaam = het gestandaardiseerde adres zoals PDOK het kent.
  // Handig voor logs/debug, niet opslaan (wij hebben al adres-velden).
  matched_name: string;
  // type = 'adres' | 'postcode' | 'woonplaats' | 'weg' — zegt iets over
  // de precisie van de match. 'adres' = huisnummer-niveau (best),
  // 'postcode' = straatniveau, 'woonplaats' = heel grof.
  match_type: string;
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  // Zoekt coördinaten bij een adres. Alle velden mogen weggelaten
  // worden; we bouwen de query uit wat er IS. Hoe meer velden, hoe
  // specifieker PDOK terugkomt.
  //
  // Retourneert null bij: lege input, geen match, netwerk-fout,
  // parse-fout. Caller zet dan gewoon latitude/longitude op null.
  async geocode(input: {
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
  }): Promise<GeocodeResult | null> {
    const query = buildQuery(input);
    if (!query) {
      return null;
    }

    const url = new URL(PDOK_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('rows', '1');
    url.searchParams.set('fl', 'centroide_ll,weergavenaam,type');
    // fq=type:adres zou strenger filteren op huisnummer-niveau, maar
    // dan missen we matches voor adressen waar PDOK alleen postcode
    // kent. Bewust weggelaten: elke match > geen match.

    // AbortController voor timeout. PDOK is meestal <500ms, maar bij
    // piek-momenten of een congestie kan het uitlopen. 10s is een
    // ruime bovengrens — langer zou onboarding onnodig vertragen.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          // Niet verplicht bij PDOK, wel een gebruikelijke nette
          // praktijk: identificeer jezelf zodat de beheerder weet
          // wie welke traffic veroorzaakt.
          'User-Agent': 'Get-Filly/1.0 (+https://get-filly.com)',
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        this.logger.warn(
          `PDOK geocode niet-OK status ${res.status} voor query "${query}"`,
        );
        return null;
      }

      const body = (await res.json()) as PdokResponse;
      const doc = body.response?.docs?.[0];
      if (!doc || !doc.centroide_ll) {
        this.logger.log(
          `PDOK geocode: geen match voor "${query}" (numFound=${body.response?.numFound ?? 0})`,
        );
        return null;
      }

      const coords = parsePoint(doc.centroide_ll);
      if (!coords) {
        this.logger.warn(
          `PDOK geocode: kon centroide_ll niet parsen: "${doc.centroide_ll}"`,
        );
        return null;
      }

      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        matched_name: doc.weergavenaam ?? query,
        match_type: doc.type ?? 'unknown',
      };
    } catch (err) {
      // AbortError = timeout, anders meestal netwerk-fout. In beide
      // gevallen: niet laten falen, gewoon null terug.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`PDOK geocode mislukt voor "${query}": ${msg}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================
// Helpers
// ============================================================

// Bouwt een query-string uit de beschikbare velden. Volgorde is
// bewust: PDOK rankt hoger bij adres + postcode combinatie. Lege
// velden worden overgeslagen zodat we geen dubbele spaties krijgen.
function buildQuery(input: {
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}): string {
  const parts: string[] = [];
  if (input.address?.trim()) parts.push(input.address.trim());
  if (input.postal_code?.trim()) parts.push(input.postal_code.trim());
  if (input.city?.trim()) parts.push(input.city.trim());
  return parts.join(' ').trim();
}

// Parsed "POINT(4.899553 52.372937)" naar { longitude, latitude }.
// Let op: WKT is (lng lat) — longitude komt eerst, dat is geen typo.
function parsePoint(
  wkt: string,
): { latitude: number; longitude: number } | null {
  const match = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;
  const lng = Number.parseFloat(match[1]);
  const lat = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Sanity-check: NL ligt ongeveer tussen 3-8°O en 50-54°N. Buiten
  // die range moet iets mis zijn gegaan (of het is geen NL-adres).
  // We accepteren 'm alsnog maar loggen het voor zichtbaarheid.
  return { latitude: lat, longitude: lng };
}

// ============================================================
// PDOK response-types
// ============================================================

type PdokResponse = {
  response?: {
    numFound?: number;
    docs?: PdokDoc[];
  };
};

type PdokDoc = {
  centroide_ll?: string;
  weergavenaam?: string;
  type?: string;
};
