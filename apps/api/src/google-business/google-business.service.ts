import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Per-request user-JWT-client (RLS actief), voor user-facing reads/writes.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
// Service-role-client (RLS-bypass), zodat token-refresh ook werkt vanuit
// achtergrond-jobs ("namens de zaak") waar geen ingelogde user is.
import { SupabaseService } from '../supabase/supabase.service';
import { TokenCryptoService } from '../common/token-crypto.service';

// ============================================================
// GoogleBusinessService, Google Bedrijfsprofiel OAuth (offline)
// ============================================================
// Server-to-server-kant van de koppeling:
//   1. code -> access + refresh token (met client_secret)
//   2. beide tokens versleutelen + opslaan in integration_credentials
//   3. refresh-helper die met de refresh-token een nieuwe access-token
//      haalt zodra de oude (bijna) verlopen is
//
// Het client_secret leeft alleen hier. De web-callback stuurt alleen de
// `code` door; tokens komen dus nooit in de browser-laag.

const PROVIDER = 'google_business';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
// Account Management API: lijst van GBP-accounts die de gebruiker beheert.
const ACCOUNTS_URL =
  'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
// Business Information API: locaties lezen + bewerken (bv. de omschrijving
// terugschrijven naar Google). LET OP: deze API moet apart worden
// ingeschakeld in het Cloud-project, los van Account Management.
const BUSINESS_INFO_BASE =
  'https://mybusinessbusinessinformation.googleapis.com/v1';
// Google My Business API v4: reviews lezen + beantwoorden. Dit is de OUDERE
// API (los inschakelen in het Cloud-project) — de Business Information API
// heeft geen reviews-endpoints.
const MYBUSINESS_V4_BASE = 'https://mybusiness.googleapis.com/v4';
// Google's sterren-enum -> getal.
const STAR_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};
// Google's harde limiet op de bedrijfsomschrijving (profile.description).
const GBP_DESCRIPTION_MAX = 750;

// Weekdagen in Google's volgorde/enum (regularHours gebruikt deze codes).
const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
type WeekdayCode = (typeof WEEKDAYS)[number];

// UI-model voor openingstijden: per dag open ja/nee + 'HH:MM'-tijden. De web
// stuurt precies dit; de API vertaalt het naar Google's regularHours-formaat.
export type DayHours = {
  day: WeekdayCode;
  open: boolean;
  openTime: string; // 'HH:MM'
  closeTime: string; // 'HH:MM'
};

// Google's TimeOfDay-fragment binnen een periode.
type GbpTime = { hours?: number; minutes?: number };
type GbpTimePeriod = {
  openDay: string;
  openTime?: GbpTime;
  closeDay: string;
  closeTime?: GbpTime;
};

function gbpTimeToStr(t?: GbpTime): string {
  const h = t?.hours ?? 0;
  const m = t?.minutes ?? 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function strToGbpTime(s: string): GbpTime {
  const [h, m] = s.split(':').map((n) => parseInt(n, 10));
  return {
    hours: Number.isFinite(h) ? h : 0,
    minutes: Number.isFinite(m) ? m : 0,
  };
}

// Strikte 'HH:MM'-check (00:00 t/m 23:59) voor invoervalidatie.
function isHhMm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// Google's storefrontAddress → één leesbare regel (voor scène 5 "lezen").
type GbpAddress = {
  addressLines?: string[];
  postalCode?: string;
  locality?: string;
  administrativeArea?: string;
};
function formatStorefrontAddress(a?: GbpAddress): string | null {
  if (!a) return null;
  const line = (a.addressLines ?? []).filter(Boolean).join(', ');
  const cityPart = [a.postalCode, a.locality].filter(Boolean).join(' ');
  const parts = [line, cityPart, a.administrativeArea].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function nextWeekday(day: WeekdayCode): WeekdayCode {
  const i = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(i + 1) % 7];
}

// Google → UI. Pakt bewust de EERSTE periode per dag; split-tijden
// (lunch + diner apart) worden in de simpele editor als één blok getoond.
function normalizeRegularHours(periods?: GbpTimePeriod[]): DayHours[] {
  const byDay = new Map<string, GbpTimePeriod>();
  for (const p of periods ?? []) {
    if (p.openDay && !byDay.has(p.openDay)) byDay.set(p.openDay, p);
  }
  return WEEKDAYS.map((day) => {
    const p = byDay.get(day);
    return p
      ? {
          day,
          open: true,
          openTime: gbpTimeToStr(p.openTime),
          closeTime: gbpTimeToStr(p.closeTime),
        }
      : { day, open: false, openTime: '09:00', closeTime: '17:00' };
  });
}

// UI → Google. Sluit-tijd ≤ open-tijd betekent doorlopen tot de volgende dag
// (nachtzaak), dus dan zetten we closeDay op de dag erna.
function buildRegularHours(days: DayHours[]): { periods: GbpTimePeriod[] } {
  const periods = days
    .filter((d) => d.open)
    .map((d) => {
      const openT = strToGbpTime(d.openTime);
      const closeT = strToGbpTime(d.closeTime);
      const openMin = (openT.hours ?? 0) * 60 + (openT.minutes ?? 0);
      const closeMin = (closeT.hours ?? 0) * 60 + (closeT.minutes ?? 0);
      const overnight = closeMin <= openMin;
      return {
        openDay: d.day,
        openTime: openT,
        closeDay: overnight ? nextWeekday(d.day) : d.day,
        closeTime: closeT,
      };
    });
  return { periods };
}
// Ververs een paar minuten vóór de echte expiry zodat een lopende
// API-call niet halverwege ongeldig wordt.
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type CredRow = {
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scopes: string[];
};

@Injectable()
export class GoogleBusinessService {
  private readonly logger = new Logger(GoogleBusinessService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    // Toegang tot de rij is bij user-facing calls al afgedwongen door
    // RestaurantAccessGuard; de admin-client gebruiken we voor de
    // token-reads/refresh zodat die ook context-loos herbruikbaar zijn.
    private readonly admin: SupabaseService,
    private readonly crypto: TokenCryptoService,
  ) {}

  private clientId(): string {
    const v = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    if (!v)
      throw new InternalServerErrorException(
        'GOOGLE_OAUTH_CLIENT_ID ontbreekt',
      );
    return v;
  }

  private clientSecret(): string {
    const v = this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    if (!v)
      throw new InternalServerErrorException(
        'GOOGLE_OAUTH_CLIENT_SECRET ontbreekt',
      );
    return v;
  }

  // Roept het token-endpoint aan en mapt Google's foutcodes naar nette,
  // machine-leesbare reasons (de web-callback toont die aan de eigenaar).
  private async postToken(
    params: URLSearchParams,
  ): Promise<GoogleTokenResponse> {
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
    } catch (err) {
      this.logger.error(
        `Google token-endpoint onbereikbaar: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Google is tijdelijk niet bereikbaar',
      );
    }

    const data = (await res.json()) as GoogleTokenResponse;
    if (!res.ok || data.error) {
      this.logger.warn(
        `Google token-fout (${res.status}): ${data.error} ${data.error_description ?? ''}`,
      );
      if (data.error === 'redirect_uri_mismatch') {
        throw new BadRequestException({
          reason: 'redirect_uri_mismatch',
          message:
            'De redirect-URI komt niet overeen met Google Cloud Console.',
        });
      }
      if (data.error === 'invalid_grant') {
        // Code al gebruikt/verlopen, OF refresh-token ingetrokken.
        throw new BadRequestException({
          reason: 'invalid_grant',
          message:
            'De autorisatie is verlopen of ingetrokken. Verbind opnieuw.',
        });
      }
      throw new BadRequestException({
        reason: 'token_exchange',
        message: 'Google-tokenuitwisseling mislukt.',
      });
    }
    return data;
  }

  /**
   * Wisselt de code om en slaat access + refresh token versleuteld op.
   * Eén rij per (restaurant, provider) via upsert.
   */
  async connect(
    restaurantId: string,
    userId: string,
    code: string,
    redirectUri: string,
  ): Promise<{ ok: true }> {
    const token = await this.postToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        redirect_uri: redirectUri,
      }),
    );

    // Refresh-token-afhandeling. Met prompt=consent geeft Google 'm altijd
    // terug. Ontbreekt 'ie toch -> val terug op een al opgeslagen refresh-
    // token. Is die er ook niet -> harde, duidelijke fout: zonder refresh-
    // token kunnen we niet langdurig namens de zaak handelen.
    let refreshToken = token.refresh_token ?? null;
    if (!refreshToken) {
      const existing = await this.loadRow(restaurantId);
      if (existing?.refresh_token_encrypted) {
        refreshToken = this.crypto.decrypt(existing.refresh_token_encrypted);
        this.logger.log(
          `Geen nieuwe refresh-token; hergebruik bestaande (${restaurantId})`,
        );
      } else {
        throw new BadRequestException({
          reason: 'no_refresh',
          message:
            'Google gaf geen refresh-token. Trek de toegang in op ' +
            'myaccount.google.com/permissions en verbind opnieuw.',
        });
      }
    }

    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;
    const scopes = token.scope ? token.scope.split(' ').filter(Boolean) : [];

    const { error } = await this.supabase.client
      .from('integration_credentials')
      .upsert(
        {
          restaurant_id: restaurantId,
          provider: PROVIDER,
          access_token_encrypted: this.crypto.encrypt(token.access_token),
          refresh_token_encrypted: this.crypto.encrypt(refreshToken),
          scopes,
          expires_at: expiresAt,
          meta: {},
          connected_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,provider' },
      );
    if (error) {
      this.logger.error(`Opslaan google-credentials faalde: ${error.message}`);
      throw new InternalServerErrorException('Koppeling opslaan mislukt');
    }
    return { ok: true };
  }

  /**
   * Geldige access-token teruggeven; ververst automatisch als 'ie (bijna)
   * verlopen is. Dit is dé methode die de "namens de zaak"-API-calls
   * straks aanroepen.
   */
  async getAccessToken(restaurantId: string): Promise<string> {
    const row = await this.loadRow(restaurantId);
    if (!row)
      throw new BadRequestException(
        'Geen Google-koppeling voor dit restaurant',
      );

    const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expMs - EXPIRY_SKEW_MS > Date.now()) {
      return this.crypto.decrypt(row.access_token_encrypted);
    }
    return this.refreshAccessToken(restaurantId);
  }

  /**
   * Token-refresh-helper: gebruikt de opgeslagen refresh-token om een
   * nieuwe access-token te halen en werkt de opslag bij.
   */
  async refreshAccessToken(restaurantId: string): Promise<string> {
    const row = await this.loadRow(restaurantId);
    if (!row)
      throw new BadRequestException(
        'Geen Google-koppeling voor dit restaurant',
      );
    if (!row.refresh_token_encrypted) {
      throw new BadRequestException({
        reason: 'no_refresh',
        message:
          'Geen refresh-token opgeslagen. Verbind het Google-profiel opnieuw.',
      });
    }

    let token: GoogleTokenResponse;
    try {
      token = await this.postToken(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.crypto.decrypt(row.refresh_token_encrypted),
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
        }),
      );
    } catch (err) {
      // invalid_grant = refresh-token ingetrokken/verlopen -> koppeling is
      // dood. Markeer als verlopen zodat de UI om her-verbinden vraagt.
      const reason =
        err instanceof BadRequestException
          ? (err.getResponse() as { reason?: string })?.reason
          : undefined;
      if (reason === 'invalid_grant') {
        await this.markExpired(restaurantId);
        throw new BadRequestException({
          reason: 'refresh_revoked',
          message:
            'De Google-toegang is ingetrokken of verlopen. Verbind opnieuw.',
        });
      }
      throw err;
    }

    const update: Record<string, unknown> = {
      access_token_encrypted: this.crypto.encrypt(token.access_token),
      expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    };
    // Google rouleert de refresh-token zelden, maar áls 'ie er is: opslaan.
    if (token.refresh_token) {
      update.refresh_token_encrypted = this.crypto.encrypt(token.refresh_token);
    }

    const { error } = await this.admin.client
      .from('integration_credentials')
      .update(update)
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);
    if (error) {
      this.logger.error(`Bijwerken access-token faalde: ${error.message}`);
      throw new InternalServerErrorException('Token bijwerken mislukt');
    }
    return token.access_token;
  }

  /** Koppelingsstatus (zonder de tokens) voor de UI. */
  async status(restaurantId: string): Promise<{
    connected: boolean;
    scopes?: string[];
    expiresAt?: string | null;
    updatedAt?: string;
  }> {
    const { data, error } = await this.supabase.client
      .from('integration_credentials')
      .select('scopes, expires_at, updated_at')
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Status ophalen mislukt');
    if (!data) return { connected: false };
    return {
      connected: true,
      scopes: data.scopes as string[],
      expiresAt: data.expires_at as string | null,
      updatedAt: data.updated_at as string,
    };
  }

  /**
   * Haalt de Google-Bedrijfsprofiel-accounts op die deze koppeling
   * beheert (Account Management API). Dit is dé call die bewijst dat de
   * business.manage-toegang werkt — precies wat we in de Google-
   * verificatievideo tonen. Gebruikt getAccessToken (auto-refresh).
   *
   * Werkt pas ná goedkeuring van de Business Profile API-toegang: tot dan
   * geeft Google 429 RESOURCE_EXHAUSTED (quotum 0; soms 403). We mappen dat
   * naar reason 'api_not_approved' zodat de UI een nette "nog in aanvraag"-
   * melding kan tonen i.p.v. een generieke fout.
   */
  async listAccounts(
    restaurantId: string,
  ): Promise<
    Array<{ name: string; accountName: string; type: string | null }>
  > {
    const accessToken = await this.getAccessToken(restaurantId);

    let res: Response;
    try {
      res = await fetch(ACCOUNTS_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      this.logger.error(`GBP accounts onbereikbaar: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(
        `GBP accounts.list ${res.status}: ${body.slice(0, 500)}`,
      );
      // Quotum 0 (access-aanvraag nog niet goedgekeurd) komt terug als 429
      // RESOURCE_EXHAUSTED ("Requests per minute" = 0), soms als 403. Beide →
      // de nette "nog in aanvraag"-melding i.p.v. een generieke fout.
      if (res.status === 429 || res.status === 403) {
        throw new BadRequestException({
          reason: 'api_not_approved',
          message:
            'Google Business Profile API-toegang is nog niet goedgekeurd ' +
            'voor dit project (quotum 0). De koppeling werkt; profielen ' +
            'ophalen kan zodra Google de access-aanvraag goedkeurt.',
        });
      }
      if (res.status === 401) {
        throw new BadRequestException({
          reason: 'token_invalid',
          message: 'Google weigerde de token. Verbind het profiel opnieuw.',
        });
      }
      throw new ServiceUnavailableException(
        `Google gaf een fout terug (${res.status}).`,
      );
    }

    const data = (await res.json()) as {
      accounts?: Array<{ name: string; accountName?: string; type?: string }>;
    };
    return (data.accounts ?? []).map((a) => ({
      name: a.name,
      accountName: a.accountName ?? '—',
      type: a.type ?? null,
    }));
  }

  /**
   * Haalt de locaties (bedrijfsvestigingen) op onder het eerste beheerde
   * account, met hun huidige omschrijving. Business Information API vereist
   * altijd een readMask. Eén account = veruit de normaalste situatie voor een
   * horecazaak; bij meerdere accounts pakken we bewust de eerste (de UI toont
   * de locaties en kiest er één om te bewerken).
   */
  async listLocations(restaurantId: string): Promise<
    Array<{
      name: string;
      title: string;
      description: string | null;
      hours: DayHours[];
      address: string | null;
      categories: string[];
      phone: string | null;
      website: string | null;
    }>
  > {
    // Locaties hangen onder een account; hergebruik de bestaande accounts.list.
    const accounts = await this.listAccounts(restaurantId);
    if (accounts.length === 0) return [];

    const accessToken = await this.getAccessToken(restaurantId);
    // readMask is verplicht; we lezen de bewerkbare velden + de basics die we
    // in scène 5 tonen (naam/adres/categorieën/telefoon/website) — bewust via
    // de geauthenticeerde API i.p.v. de openbare Places-data.
    const url =
      `${BUSINESS_INFO_BASE}/${accounts[0].name}/locations` +
      `?readMask=name,title,profile.description,regularHours,` +
      `storefrontAddress,categories,phoneNumbers,websiteUri&pageSize=100`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      this.logger.error(
        `GBP locations onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'locations.list');
    }

    const data = (await res.json()) as {
      locations?: Array<{
        name: string;
        title?: string;
        profile?: { description?: string };
        regularHours?: { periods?: GbpTimePeriod[] };
        storefrontAddress?: GbpAddress;
        categories?: {
          primaryCategory?: { displayName?: string };
          additionalCategories?: Array<{ displayName?: string }>;
        };
        phoneNumbers?: { primaryPhone?: string };
        websiteUri?: string;
      }>;
    };
    return (data.locations ?? []).map((l) => {
      const cats = [
        l.categories?.primaryCategory?.displayName,
        ...(l.categories?.additionalCategories ?? []).map((c) => c.displayName),
      ].filter((c): c is string => !!c);
      return {
        name: l.name, // vorm: 'locations/{id}'
        title: l.title ?? '—',
        description: l.profile?.description ?? null,
        hours: normalizeRegularHours(l.regularHours?.periods),
        address: formatStorefrontAddress(l.storefrontAddress),
        categories: cats,
        phone: l.phoneNumbers?.primaryPhone ?? null,
        website: l.websiteUri ?? null,
      };
    });
  }

  /**
   * Schrijft de reguliere weekopeningstijden terug naar Google
   * (locations.patch, updateMask=regularHours). LET OP: dit overschrijft de
   * volledige regularHours; eventuele split-tijden (lunch+diner apart) die de
   * eigenaar niet in de simpele editor ziet, gaan verloren. Voor de meeste
   * horecazaken met één doorlopend blok per dag is dat prima.
   */
  async updateHours(
    restaurantId: string,
    locationName: string,
    days: DayHours[],
  ): Promise<{ ok: true; hours: DayHours[] }> {
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    // Validatie: alleen bekende dagen + geldige 'HH:MM' voor open dagen.
    for (const d of days) {
      if (!WEEKDAYS.includes(d.day)) {
        throw new BadRequestException(`Onbekende dag: ${d.day}`);
      }
      if (d.open && (!isHhMm(d.openTime) || !isHhMm(d.closeTime))) {
        throw new BadRequestException(
          `Ongeldige tijd voor ${d.day} (verwacht HH:MM)`,
        );
      }
    }

    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${BUSINESS_INFO_BASE}/${locationName}?updateMask=regularHours`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ regularHours: buildRegularHours(days) }),
      });
    } catch (err) {
      this.logger.error(
        `GBP regularHours-patch onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'hours.patch');
    }

    const data = (await res.json()) as {
      regularHours?: { periods?: GbpTimePeriod[] };
    };
    this.logger.log(
      `GBP openingstijden bijgewerkt (restaurant ${restaurantId}, ${locationName})`,
    );
    return {
      ok: true,
      hours: normalizeRegularHours(data.regularHours?.periods),
    };
  }

  /**
   * Zet de opgegeven sluitingsdata (ISO 'YYYY-MM-DD') als afwijkende
   * openingstijden (specialHours, closed=true) op de Google-listing.
   * Overschrijft de volledige specialHours van de locatie.
   */
  async updateSpecialDays(
    restaurantId: string,
    locationName: string,
    closedDates: string[],
  ): Promise<{ ok: true; count: number }> {
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    const periods = closedDates.map((iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) throw new BadRequestException(`Ongeldige datum: ${iso}`);
      const [, y, mo, d] = m;
      const date = {
        year: parseInt(y, 10),
        month: parseInt(mo, 10),
        day: parseInt(d, 10),
      };
      // Eén gesloten dag = startDate == endDate + closed=true.
      return { startDate: date, endDate: date, closed: true };
    });

    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${BUSINESS_INFO_BASE}/${locationName}?updateMask=specialHours`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ specialHours: { specialHourPeriods: periods } }),
      });
    } catch (err) {
      this.logger.error(
        `GBP specialHours-patch onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(
        res.status,
        await res.text(),
        'specialHours.patch',
      );
    }

    this.logger.log(
      `GBP speciale dagen bijgewerkt (restaurant ${restaurantId}, ${periods.length} dagen)`,
    );
    return { ok: true, count: periods.length };
  }

  /**
   * DE ECHTE WRITE: schrijft de bedrijfsomschrijving terug naar Google
   * (locations.patch met updateMask=profile.description). Dit is de actie die
   * in de OAuth-verificatievideo bewijst dat we de business.manage-scope niet
   * alleen lezen maar ook gebruiken om de listing te bewerken.
   */
  async updateDescription(
    restaurantId: string,
    locationName: string,
    description: string,
  ): Promise<{ ok: true; description: string }> {
    // locationName moet exact de vorm 'locations/{id}' hebben zoals list 'm
    // teruggeeft; zo voorkomen we path-injection in de PATCH-URL.
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    const trimmed = description.trim();
    if (trimmed.length > GBP_DESCRIPTION_MAX) {
      throw new BadRequestException(
        `De omschrijving mag maximaal ${GBP_DESCRIPTION_MAX} tekens zijn ` +
          `(nu ${trimmed.length}).`,
      );
    }

    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${BUSINESS_INFO_BASE}/${locationName}?updateMask=profile.description`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile: { description: trimmed } }),
      });
    } catch (err) {
      this.logger.error(
        `GBP locations.patch onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'locations.patch');
    }

    const data = (await res.json()) as { profile?: { description?: string } };
    this.logger.log(
      `GBP omschrijving bijgewerkt (restaurant ${restaurantId}, ${locationName})`,
    );
    return { ok: true, description: data.profile?.description ?? trimmed };
  }

  /**
   * Haalt de reviews van een locatie op (Google My Business API v4). v4
   * gebruikt de resource-vorm 'accounts/{a}/locations/{l}', dus we plakken de
   * account-naam vóór de locationName ('locations/{l}').
   */
  async listReviews(
    restaurantId: string,
    locationName: string,
  ): Promise<{
    averageRating: number | null;
    totalReviewCount: number;
    reviews: Array<{
      name: string;
      reviewer: string;
      stars: number;
      comment: string | null;
      createTime: string | null;
      reply: string | null;
    }>;
  }> {
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    const accounts = await this.listAccounts(restaurantId);
    if (accounts.length === 0) {
      throw new BadRequestException('Geen beheerd Google-account gevonden');
    }
    const accessToken = await this.getAccessToken(restaurantId);
    // v4-pad: accounts/{a}/locations/{l}/reviews
    const url =
      `${MYBUSINESS_V4_BASE}/${accounts[0].name}/${locationName}/reviews` +
      `?pageSize=50&orderBy=updateTime desc`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      this.logger.error(`GBP reviews onbereikbaar: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'reviews.list');
    }

    const data = (await res.json()) as {
      averageRating?: number;
      totalReviewCount?: number;
      reviews?: Array<{
        name: string;
        starRating?: string;
        comment?: string;
        createTime?: string;
        reviewer?: { displayName?: string };
        reviewReply?: { comment?: string };
      }>;
    };
    return {
      averageRating: data.averageRating ?? null,
      totalReviewCount: data.totalReviewCount ?? 0,
      reviews: (data.reviews ?? []).map((r) => ({
        name: r.name, // 'accounts/{a}/locations/{l}/reviews/{r}'
        reviewer: r.reviewer?.displayName ?? '—',
        stars: r.starRating ? (STAR_MAP[r.starRating] ?? 0) : 0,
        comment: r.comment ?? null,
        createTime: r.createTime ?? null,
        reply: r.reviewReply?.comment ?? null,
      })),
    };
  }

  /**
   * DE ECHTE WRITE op reviews: plaatst (of vervangt) het antwoord van de zaak
   * op een review (v4 reviews.updateReply, PUT op .../reply). reviewName is de
   * volledige 'accounts/{a}/locations/{l}/reviews/{r}'-resource.
   */
  async replyToReview(
    restaurantId: string,
    reviewName: string,
    comment: string,
  ): Promise<{ ok: true; comment: string }> {
    if (
      !/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(reviewName)
    ) {
      throw new BadRequestException('Ongeldige reviewName');
    }
    const trimmed = comment.trim();
    if (!trimmed) {
      throw new BadRequestException('Het antwoord mag niet leeg zijn');
    }

    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${MYBUSINESS_V4_BASE}/${reviewName}/reply`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment: trimmed }),
      });
    } catch (err) {
      this.logger.error(
        `GBP reviews.reply onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'reviews.reply');
    }

    const data = (await res.json()) as { comment?: string };
    this.logger.log(
      `GBP review beantwoord (restaurant ${restaurantId}, ${reviewName})`,
    );
    return { ok: true, comment: data.comment ?? trimmed };
  }

  /**
   * Maakt een Google Post (update) op de locatie aan (v4 localPosts.create).
   * Een STANDARD-post met alleen tekst; optioneel een call-to-action-knop met
   * URL. Reviewer ziet zo dat de posts-scope-claim echt gebruikt wordt.
   */
  async createLocalPost(
    restaurantId: string,
    locationName: string,
    summary: string,
    actionUrl?: string,
    mediaUrl?: string,
  ): Promise<{ ok: true; name: string; searchUrl: string | null }> {
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    const trimmed = summary.trim();
    if (!trimmed) {
      throw new BadRequestException('De posttekst mag niet leeg zijn');
    }
    // Google's limiet op de summary van een local post is 1500 tekens.
    if (trimmed.length > 1500) {
      throw new BadRequestException(
        `De post mag maximaal 1500 tekens zijn (nu ${trimmed.length}).`,
      );
    }

    const accounts = await this.listAccounts(restaurantId);
    if (accounts.length === 0) {
      throw new BadRequestException('Geen beheerd Google-account gevonden');
    }
    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${MYBUSINESS_V4_BASE}/${accounts[0].name}/${locationName}/localPosts`;

    const body: Record<string, unknown> = {
      languageCode: 'nl',
      summary: trimmed,
      topicType: 'STANDARD',
    };
    if (actionUrl) {
      body.callToAction = { actionType: 'LEARN_MORE', url: actionUrl };
    }
    // Foto meesturen: Google haalt 'm server-side op via de (publiek
    // bereikbare) URL. Een signed Supabase-URL volstaat, net als bij Meta.
    if (mediaUrl) {
      body.media = [{ mediaFormat: 'PHOTO', sourceUrl: mediaUrl }];
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(
        `GBP localPosts.create onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(
        res.status,
        await res.text(),
        'localPosts.create',
      );
    }

    const data = (await res.json()) as { name?: string; searchUrl?: string };
    this.logger.log(
      `GBP post geplaatst (restaurant ${restaurantId}, ${locationName})`,
    );
    return {
      ok: true,
      name: data.name ?? '',
      searchUrl: data.searchUrl ?? null,
    };
  }

  /**
   * Uploadt een foto naar het Bedrijfsprofiel (v4 media.create). Google haalt
   * de foto server-side op via de (publiek bereikbare) sourceUrl — een signed
   * bibliotheek-URL volstaat. `category` bepaalt waar de foto landt:
   * COVER (omslag), LOGO (profielfoto) of ADDITIONAL (extra foto, default).
   */
  async uploadLocationMedia(
    restaurantId: string,
    locationName: string,
    sourceUrl: string,
    category: 'COVER' | 'LOGO' | 'ADDITIONAL' = 'ADDITIONAL',
  ): Promise<{ ok: true; name: string }> {
    if (!/^locations\/[^/]+$/.test(locationName)) {
      throw new BadRequestException('Ongeldige locationName');
    }
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
      throw new BadRequestException('Een geldige foto-URL is verplicht');
    }

    const accounts = await this.listAccounts(restaurantId);
    if (accounts.length === 0) {
      throw new BadRequestException('Geen beheerd Google-account gevonden');
    }
    const accessToken = await this.getAccessToken(restaurantId);
    const url = `${MYBUSINESS_V4_BASE}/${accounts[0].name}/${locationName}/media`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaFormat: 'PHOTO',
          locationAssociation: { category },
          sourceUrl,
        }),
      });
    } catch (err) {
      this.logger.error(
        `GBP media.create onbereikbaar: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Google is tijdelijk niet bereikbaar',
      );
    }
    if (!res.ok) {
      this.throwGoogleApiError(res.status, await res.text(), 'media.create');
    }

    const data = (await res.json()) as { name?: string };
    this.logger.log(
      `GBP foto geüpload (restaurant ${restaurantId}, ${locationName}, ${category})`,
    );
    return { ok: true, name: data.name ?? '' };
  }

  /** Koppeling intrekken: best-effort revoke bij Google + rij wissen. */
  async disconnect(restaurantId: string): Promise<{ ok: true }> {
    const row = await this.loadRow(restaurantId);
    if (row?.refresh_token_encrypted) {
      try {
        await fetch(REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: this.crypto.decrypt(row.refresh_token_encrypted),
          }),
        });
      } catch (err) {
        this.logger.warn(
          `Google-token intrekken faalde (negeer): ${String(err)}`,
        );
      }
    }
    const { error } = await this.supabase.client
      .from('integration_credentials')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);
    if (error)
      throw new InternalServerErrorException('Koppeling verwijderen mislukt');
    return { ok: true };
  }

  // ---------------- private ----------------

  // Mapt een niet-OK Business-Profile-API-response naar dezelfde nette,
  // machine-leesbare reasons als accounts.list. Return-type `never`: deze
  // helper gooit altijd, dus TS weet dat de code erna onbereikbaar is.
  private throwGoogleApiError(
    status: number,
    bodyText: string,
    label: string,
  ): never {
    this.logger.warn(`GBP ${label} ${status}: ${bodyText.slice(0, 500)}`);
    // Quotum 0 (access-aanvraag / API nog niet ingeschakeld) => 429/403.
    if (status === 429 || status === 403) {
      throw new BadRequestException({
        reason: 'api_not_approved',
        message:
          'Google Business Profile API-toegang is nog niet goedgekeurd of ' +
          'de Business Information API staat niet aan voor dit project. ' +
          'Dit werkt zodra dat geregeld is.',
      });
    }
    if (status === 401) {
      throw new BadRequestException({
        reason: 'token_invalid',
        message: 'Google weigerde de token. Verbind het profiel opnieuw.',
      });
    }
    throw new ServiceUnavailableException(
      `Google gaf een fout terug (${status}).`,
    );
  }

  // Admin-client: werkt in zowel request- als achtergrond-context.
  private async loadRow(restaurantId: string): Promise<CredRow | null> {
    const { data, error } = await this.admin.client
      .from('integration_credentials')
      .select(
        'access_token_encrypted, refresh_token_encrypted, expires_at, scopes',
      )
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (error) {
      this.logger.error(`Google-credentials ophalen faalde: ${error.message}`);
      throw new InternalServerErrorException('Koppeling ophalen mislukt');
    }
    return (data as CredRow) ?? null;
  }

  private async markExpired(restaurantId: string): Promise<void> {
    await this.admin.client
      .from('integration_credentials')
      .update({
        expires_at: new Date(0).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);
  }
}
