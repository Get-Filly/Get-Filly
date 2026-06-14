import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
      throw new InternalServerErrorException('GOOGLE_OAUTH_CLIENT_ID ontbreekt');
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
      throw new InternalServerErrorException('Google is tijdelijk niet bereikbaar');
    }

    const data = (await res.json()) as GoogleTokenResponse;
    if (!res.ok || data.error) {
      this.logger.warn(
        `Google token-fout (${res.status}): ${data.error} ${data.error_description ?? ''}`,
      );
      if (data.error === 'redirect_uri_mismatch') {
        throw new BadRequestException({
          reason: 'redirect_uri_mismatch',
          message: 'De redirect-URI komt niet overeen met Google Cloud Console.',
        });
      }
      if (data.error === 'invalid_grant') {
        // Code al gebruikt/verlopen, OF refresh-token ingetrokken.
        throw new BadRequestException({
          reason: 'invalid_grant',
          message: 'De autorisatie is verlopen of ingetrokken. Verbind opnieuw.',
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
      throw new BadRequestException('Geen Google-koppeling voor dit restaurant');

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
      throw new BadRequestException('Geen Google-koppeling voor dit restaurant');
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
          message: 'De Google-toegang is ingetrokken of verlopen. Verbind opnieuw.',
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
        this.logger.warn(`Google-token intrekken faalde (negeer): ${String(err)}`);
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
