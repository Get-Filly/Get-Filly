import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Per-request user-JWT-client (RLS actief). De RLS-policies op
// integration_credentials beperken alles tot rijen van het restaurant
// waar de ingelogde user lid van is.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { TokenCryptoService } from '../common/token-crypto.service';

// ============================================================
// MetaService, Meta (Facebook/Instagram) OAuth — token-opslag
// ============================================================
// Hier gebeurt de server-to-server-kant van de koppeling:
//   1. code → short-lived user-token (met app-secret)
//   2. short-lived → long-lived token (~60 dagen)
//   3. token versleutelen + opslaan in integration_credentials
//
// De web-callback (/oauth/meta/callback) valideert de CSRF-state en
// stuurt daarna alleen de `code` hierheen — de long-lived token komt
// dus nooit in de web-laag, en het app-secret leeft alleen hier.

const PROVIDER = 'meta';

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    private readonly crypto: TokenCryptoService,
  ) {}

  private graphVersion(): string {
    return this.config.get<string>('META_GRAPH_VERSION') ?? 'v21.0';
  }

  private appId(): string {
    const v = this.config.get<string>('META_APP_ID');
    if (!v) throw new InternalServerErrorException('META_APP_ID ontbreekt');
    return v;
  }

  private appSecret(): string {
    const v = this.config.get<string>('META_APP_SECRET');
    if (!v) throw new InternalServerErrorException('META_APP_SECRET ontbreekt');
    return v;
  }

  // Stap 1: eenmalige code → short-lived user-token.
  private async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId(),
      client_secret: this.appSecret(),
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/oauth/access_token?${params.toString()}`,
    );
    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Meta code-exchange faalde (${res.status}): ${body}`);
      throw new BadRequestException('Meta-tokenuitwisseling mislukt');
    }
    return (await res.json()) as MetaTokenResponse;
  }

  // Stap 2: short-lived → long-lived (~60 dagen). Faalt dit, dan val
  // je terug op de short-lived token i.p.v. de hele koppeling te laten
  // mislukken (de UI/stap-4 kan later vernieuwen).
  private async exchangeLongLived(
    shortToken: string,
  ): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId(),
      client_secret: this.appSecret(),
      fb_exchange_token: shortToken,
    });
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/oauth/access_token?${params.toString()}`,
    );
    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(
        `Meta long-lived-exchange faalde (${res.status}): ${body}`,
      );
      return { access_token: shortToken };
    }
    return (await res.json()) as MetaTokenResponse;
  }

  /**
   * Wisselt de code om en slaat de versleutelde long-lived token op.
   * Eén rij per (restaurant, provider) via upsert.
   */
  async connect(
    restaurantId: string,
    userId: string,
    code: string,
    redirectUri: string,
  ): Promise<{ ok: true }> {
    const short = await this.exchangeCode(code, redirectUri);
    const long = await this.exchangeLongLived(short.access_token);

    const encrypted = this.crypto.encrypt(long.access_token);
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;

    const { error } = await this.supabase.client
      .from('integration_credentials')
      .upsert(
        {
          restaurant_id: restaurantId,
          provider: PROVIDER,
          access_token_encrypted: encrypted,
          // TODO (stap 4): toegekende scopes uitlezen via debug_token /
          // /me/permissions; nu leeg gelaten.
          scopes: [],
          expires_at: expiresAt,
          connected_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,provider' },
      );

    if (error) {
      this.logger.error(
        `Opslaan integration_credentials faalde: ${error.message}`,
      );
      throw new InternalServerErrorException('Koppeling opslaan mislukt');
    }
    return { ok: true };
  }

  /** Verwijdert de Meta-koppeling van dit restaurant (data-deletion). */
  async disconnect(restaurantId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client
      .from('integration_credentials')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);

    if (error) {
      this.logger.error(
        `Verwijderen integration_credentials faalde: ${error.message}`,
      );
      throw new InternalServerErrorException('Koppeling verwijderen mislukt');
    }
    return { ok: true };
  }

  /** Koppelingsstatus (zonder de token zelf) voor de UI. */
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

    if (error) {
      this.logger.error(
        `Status integration_credentials faalde: ${error.message}`,
      );
      throw new InternalServerErrorException('Status ophalen mislukt');
    }
    if (!data) return { connected: false };
    return {
      connected: true,
      scopes: data.scopes as string[],
      expiresAt: data.expires_at as string | null,
      updatedAt: data.updated_at as string,
    };
  }
}
