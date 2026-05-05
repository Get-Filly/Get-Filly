import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Per-request user-JWT-client (RLS actief). Zelfde patroon als de
// andere 13 services die we per 2026-05-01 hebben gemigreerd.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AuditLogService } from '../common/audit-log.service';
import {
  type PlaceSearchResult,
  type PlaceDetails,
  type NearbyPlace,
  SEARCH_FIELD_MASK,
  DETAILS_FIELD_MASK,
  NEARBY_FIELD_MASK,
  PLACE_DATA_TTL_MS,
} from './types';
import { runAudit, type AuditResult } from './audit';

/**
 * ============================================================
 * GoogleProfileService — wrapper rond Google Places API (New)
 * ============================================================
 *
 * Drie verantwoordelijkheden, in deze volgorde van complexiteit:
 *
 *   1. Low-level fetch-client met error-handling (`callPlaces`).
 *      Vervangt het rauwe `fetch()`-patroon zodat retries, logging
 *      en error-translatie op één plek zitten.
 *
 *   2. Cache-laag bovenop place-details (TTL 24u in
 *      `restaurants.google_place_data`). Voorkomt dat we per
 *      page-load $0,02 verbranden.
 *
 *   3. Public methods voor de controller: search / connect /
 *      getMine / refresh / nearby.
 *
 * ALLE methods gebruiken de per-request Supabase-client zodat RLS
 * automatisch het juiste restaurant filtert. We schrijven alleen via
 * eq('id', restaurantId) als extra veiligheid (defense-in-depth).
 *
 * Geen retry-logic ingebouwd. Places API is doorgaans betrouwbaar;
 * bij uitval krijgt de gebruiker een nette NL-foutmelding en kan 'ie
 * later opnieuw proberen. Rate-limits zien we in metrics — die
 * pakken we pas aan als ze bestaan.
 * ============================================================
 */
@Injectable()
export class GoogleProfileService {
  private readonly logger = new Logger(GoogleProfileService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://places.googleapis.com/v1';

  constructor(
    config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    private readonly audit: AuditLogService,
  ) {
    // Bewust hard-faal als de key ontbreekt — dat is een config-fout
    // die direct gevangen moet worden, niet pas bij de eerste echte
    // API-call. Zo crasht de Nest-bootstrap met een duidelijke melding
    // i.p.v. dat de hub-pagina later mysterieuze 500's geeft.
    const key = config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!key) {
      throw new Error(
        'GOOGLE_PLACES_API_KEY ontbreekt in env. Zie docs/google-business-setup.md.',
      );
    }
    this.apiKey = key;
  }

  // ---------------- Public API ----------------

  /**
   * Tekst-zoekopdracht via Places API. Voor onboarding-detect ("vind
   * mijn zaak") en voor concurrent-toevoegen later.
   *
   * Returns max 5 matches, gesorteerd op relevantie (Google's eigen
   * ranking — meestal: hoogste rating + dichtstbijzijnde adres-match
   * eerst).
   */
  async searchByText(
    query: string,
    bias?: { lat: number; lng: number; radiusMeters?: number },
  ): Promise<PlaceSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException(
        'Zoekopdracht is te kort (minimaal 3 tekens).',
      );
    }

    // Body-shape volgt de Places API (New) spec. `locationBias`
    // is optioneel — geven we mee als de eigenaar al een adres
    // heeft (verhoogt match-precisie aanzienlijk).
    const body: Record<string, unknown> = {
      textQuery: trimmed,
      languageCode: 'nl',
      regionCode: 'NL',
      maxResultCount: 5,
    };
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: bias.radiusMeters ?? 1000,
        },
      };
    }

    const data = await this.callPlaces<{ places?: RawPlace[] }>(
      'places:searchText',
      'POST',
      SEARCH_FIELD_MASK,
      body,
    );

    return (data.places ?? []).map(toSearchResult);
  }

  /**
   * Koppel een Google Place aan dit restaurant. Slaat het place_id op
   * + fetcht meteen de details om de cache te vullen. Eigenaar ziet
   * direct alle data zonder tweede call.
   *
   * Idempotent: bij her-koppelen aan hetzelfde place_id wordt de cache
   * gewoon ververst. Bij een ander place_id wordt het oude vervangen.
   */
  async connect(
    restaurantId: string,
    userId: string,
    placeId: string,
  ): Promise<{ data: PlaceDetails; syncedAt: string }> {
    if (!placeId.startsWith('ChIJ') && !placeId.startsWith('GhIJ')) {
      // Google place_id's beginnen met "ChIJ" of "GhIJ" — een ruwe
      // sanity-check tegen typo's en onbedoelde input.
      throw new BadRequestException('Ongeldig Google place_id-formaat.');
    }

    const details = await this.fetchPlaceDetails(placeId);
    const now = new Date().toISOString();

    const { error } = await this.supabase.client
      .from('restaurants')
      .update({
        google_place_id: placeId,
        google_place_data: details,
        google_place_synced_at: now,
      })
      .eq('id', restaurantId);

    if (error) throw new InternalServerErrorException(error.message);

    // Audit: wie koppelde welk place_id wanneer. Niet de hele blob
    // loggen — alleen de identifier zodat het log compact blijft.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'google_profile_connected',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: {
        place_id: placeId,
        display_name: details.displayName,
      },
    });

    return { data: details, syncedAt: now };
  }

  /**
   * Lees de gecachete profiel-data voor dit restaurant. Refresh
   * automatisch als de cache ouder is dan TTL.
   *
   * Returnt `connected: false` als het restaurant geen place_id heeft
   * — dat is GEEN error, dat is gewoon de "nog niet gekoppeld"-state.
   */
  async getMine(restaurantId: string): Promise<{
    connected: boolean;
    data: PlaceDetails | null;
    syncedAt: string | null;
  }> {
    const { data: row, error } = await this.supabase.client
      .from('restaurants')
      .select(
        'google_place_id, google_place_data, google_place_synced_at',
      )
      .eq('id', restaurantId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!row || !row.google_place_id) {
      return { connected: false, data: null, syncedAt: null };
    }

    // Cache-TTL-check. Verlopen → refresh on-demand.
    const stale =
      !row.google_place_synced_at ||
      Date.now() - new Date(row.google_place_synced_at).getTime() >
        PLACE_DATA_TTL_MS;

    if (stale) {
      try {
        return await this.refreshInternal(restaurantId, row.google_place_id);
      } catch (err) {
        // Refresh-fout is niet kritiek — return de stale cache met een
        // log-warning. Beter oude data dan helemaal niks.
        this.logger.warn(
          `Stale-refresh voor restaurant ${restaurantId} faalde: ${(err as Error).message}. Toon cached.`,
        );
      }
    }

    return {
      connected: true,
      data: row.google_place_data as PlaceDetails,
      syncedAt: row.google_place_synced_at,
    };
  }

  /**
   * Force-refresh van de profiel-data — gebruikt door de "Vernieuw"-
   * knop op de hub. Bypasst de TTL-check.
   */
  async refresh(
    restaurantId: string,
    userId: string,
  ): Promise<{ data: PlaceDetails; syncedAt: string }> {
    const { data: row, error } = await this.supabase.client
      .from('restaurants')
      .select('google_place_id')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!row?.google_place_id) {
      throw new NotFoundException(
        'Geen Google-koppeling. Verbind eerst je profiel.',
      );
    }

    const result = await this.refreshInternal(restaurantId, row.google_place_id);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'google_profile_refreshed',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: { place_id: row.google_place_id },
    });

    return { data: result.data!, syncedAt: result.syncedAt! };
  }

  /**
   * Profiel-audit: doorlopen 12+ deterministische regels op de
   * gecachete place-data. Geen Claude-call — runtime is sub-ms en
   * gratis. Voor klanten zonder koppeling: NotFound.
   *
   * Verloopt door `getMine()` zodat we de dezelfde TTL-refresh-logica
   * krijgen — dus altijd recent data tenzij Places API down is.
   */
  async getAudit(restaurantId: string): Promise<AuditResult> {
    const me = await this.getMine(restaurantId);
    if (!me.connected || !me.data) {
      throw new NotFoundException(
        'Geen Google-koppeling. Verbind eerst je profiel via de hub.',
      );
    }
    return runAudit(me.data);
  }

  /**
   * Buurt-vergelijking: zoek vergelijkbare horeca binnen een straal.
   *
   * Gebruikt de location uit de gecachete place-data (geen extra API-
   * call om coords op te halen). Filtert het eigen restaurant uit het
   * resultaat zodat je niet jezelf in de tabel ziet.
   *
   * Geen cache hier — wordt zelden opgevraagd (1× per week per klant
   * volgens schatting), en concurrent-data verandert wat sneller dan
   * je eigen profiel.
   */
  async getCompetitors(
    restaurantId: string,
    radiusMeters: number = 1000,
  ): Promise<NearbyPlace[]> {
    if (radiusMeters < 100 || radiusMeters > 5000) {
      throw new BadRequestException('Straal moet tussen 100 en 5000 meter.');
    }

    const me = await this.getMine(restaurantId);
    if (!me.connected || !me.data || !me.data.location) {
      throw new NotFoundException(
        'Geen Google-koppeling met locatie. Verbind eerst je profiel.',
      );
    }

    const { latitude, longitude } = me.data.location;

    // Nearby-search met includedTypes = restaurant zodat we alleen
    // horeca terugkrijgen. (Zonder filter zou je ook winkels en
    // benzine-stations binnen de straal krijgen.)
    const data = await this.callPlaces<{ places?: RawPlace[] }>(
      'places:searchNearby',
      'POST',
      NEARBY_FIELD_MASK,
      {
        includedTypes: ['restaurant'],
        maxResultCount: 20,
        languageCode: 'nl',
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radiusMeters,
          },
        },
      },
    );

    const competitors: NearbyPlace[] = (data.places ?? [])
      .filter((p) => p.id !== me.data!.placeId)
      .map((p) => ({
        placeId: p.id,
        displayName: p.displayName?.text ?? '—',
        formattedAddress: p.formattedAddress ?? '—',
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? null,
        primaryType: p.primaryType ?? null,
        distanceMeters: p.location
          ? haversineMeters(
              latitude,
              longitude,
              p.location.latitude,
              p.location.longitude,
            )
          : null,
        photoCount: Array.isArray(p.photos) ? p.photos.length : 0,
      }))
      // Sorteer op afstand zodat de dichtstbijzijnde concurrenten
      // bovenaan staan — meest relevant voor de eigenaar.
      .sort((a, b) => (a.distanceMeters ?? 9e9) - (b.distanceMeters ?? 9e9));

    return competitors;
  }

  /**
   * Ontkoppel het Google-profiel: wis place_id + cache + sync-timestamp.
   * Audit-log-entry zodat we kunnen zien wie wanneer ontkoppelde
   * (handig bij support-vragen "ineens werkt mijn profiel-audit niet").
   */
  async disconnect(
    restaurantId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    const { error } = await this.supabase.client
      .from('restaurants')
      .update({
        google_place_id: null,
        google_place_data: null,
        google_place_synced_at: null,
      })
      .eq('id', restaurantId);
    if (error) throw new InternalServerErrorException(error.message);

    await this.audit.log({
      restaurantId,
      userId,
      action: 'google_profile_disconnected',
      entity_type: 'restaurant',
      entity_id: restaurantId,
      payload: {},
    });

    return { ok: true };
  }

  // ---------------- Private helpers ----------------

  /**
   * Lage-niveau fetch met de Places-API. Vertaalt fout-statuscodes
   * naar Nest-exceptions met begrijpelijke NL-meldingen voor de
   * front-end.
   */
  private async callPlaces<T>(
    path: string,
    method: 'GET' | 'POST',
    fieldMask: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      this.logger.error(
        `Places API netwerkfout (${path}): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google Places is tijdelijk niet bereikbaar. Probeer het later opnieuw.',
      );
    }

    if (!res.ok) {
      const errBody = await res.text();
      this.logger.warn(
        `Places API ${res.status} (${path}): ${errBody.slice(0, 500)}`,
      );
      // 404 op place-details = place_id bestaat niet (meer). 403 =
      // key/restrictie-issue. Andere = generieke melding.
      if (res.status === 404) {
        throw new NotFoundException(
          'Google kent dit profiel niet (meer). Het kan verwijderd of samengevoegd zijn.',
        );
      }
      if (res.status === 403) {
        throw new InternalServerErrorException(
          'Google Places API-toegang geweigerd. Check de API-key en restricties.',
        );
      }
      throw new ServiceUnavailableException(
        `Google Places gaf een fout terug (${res.status}).`,
      );
    }

    return (await res.json()) as T;
  }

  /**
   * Haal volledige place-details op en mappen naar onze interne shape.
   * Geen cache-check — caller bepaalt of refresh nodig is.
   */
  private async fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
    const raw = await this.callPlaces<RawPlace>(
      `places/${encodeURIComponent(placeId)}`,
      'GET',
      DETAILS_FIELD_MASK,
    );
    return toPlaceDetails(raw);
  }

  /**
   * Refresh-helper, gebruikt door zowel TTL-stale-flow als handmatig
   * refresh-endpoint. Bevat de daadwerkelijke fetch + DB-update.
   */
  private async refreshInternal(
    restaurantId: string,
    placeId: string,
  ): Promise<{ connected: true; data: PlaceDetails; syncedAt: string }> {
    const details = await this.fetchPlaceDetails(placeId);
    const now = new Date().toISOString();

    const { error } = await this.supabase.client
      .from('restaurants')
      .update({
        google_place_data: details,
        google_place_synced_at: now,
      })
      .eq('id', restaurantId);
    if (error) throw new InternalServerErrorException(error.message);

    return { connected: true, data: details, syncedAt: now };
  }
}

// ============================================================
// Helpers buiten de class — pure functies, makkelijker te testen
// ============================================================

// Raw shape uit Places API. We typen 'm zo strict mogelijk maar Google
// kan velden weglaten als ze er niet zijn (vandaar overal optional).
interface RawPlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  postalAddress?: {
    addressLines?: string[];
    locality?: string;
    postalCode?: string;
    administrativeArea?: string;
    regionCode?: string;
  };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  priceLevel?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
  };
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  businessStatus?: string;
  editorialSummary?: { text?: string };
}

function toSearchResult(raw: RawPlace): PlaceSearchResult {
  return {
    placeId: raw.id,
    displayName: raw.displayName?.text ?? '—',
    formattedAddress: raw.formattedAddress ?? '—',
    rating: raw.rating ?? null,
    userRatingCount: raw.userRatingCount ?? null,
  };
}

function toPlaceDetails(raw: RawPlace): PlaceDetails {
  return {
    placeId: raw.id,
    displayName: raw.displayName?.text ?? '—',
    formattedAddress: raw.formattedAddress ?? '—',
    postalAddress: raw.postalAddress
      ? {
          streetAddress:
            raw.postalAddress.addressLines?.join(', ') ?? null,
          locality: raw.postalAddress.locality ?? null,
          postalCode: raw.postalAddress.postalCode ?? null,
          administrativeArea: raw.postalAddress.administrativeArea ?? null,
          country: raw.postalAddress.regionCode ?? null,
        }
      : null,
    location: raw.location ?? null,
    rating: raw.rating ?? null,
    userRatingCount: raw.userRatingCount ?? null,
    types: raw.types ?? [],
    primaryType: raw.primaryType ?? null,
    priceLevel: raw.priceLevel ?? null,
    websiteUri: raw.websiteUri ?? null,
    internationalPhoneNumber: raw.internationalPhoneNumber ?? null,
    regularOpeningHours: raw.regularOpeningHours
      ? {
          weekdayDescriptions: raw.regularOpeningHours.weekdayDescriptions ?? [],
          openNow: raw.regularOpeningHours.openNow ?? null,
        }
      : null,
    photos:
      raw.photos?.map((p) => ({
        name: p.name,
        widthPx: p.widthPx ?? 0,
        heightPx: p.heightPx ?? 0,
      })) ?? [],
    businessStatus: raw.businessStatus ?? null,
    editorialSummary: raw.editorialSummary?.text ?? null,
  };
}

// Haversine-formule voor afstand-berekening tussen twee lat/lng-paren.
// Output in meters. Gebruikt door competitors-flow zodat we kunnen
// sorteren op afstand (Google geeft afstand niet automatisch terug).
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Aarde-straal in meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
