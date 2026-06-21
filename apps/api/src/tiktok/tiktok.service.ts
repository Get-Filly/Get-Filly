import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { TokenCryptoService } from '../common/token-crypto.service';

// ============================================================
// TikTokService, Login Kit + Content Posting API — token-opslag
// ============================================================
// Server-to-server-kant van de TikTok-koppeling (spiegelt MetaService):
//   1. code → access_token + refresh_token (met client_secret)
//   2. user.info.basic ophalen (open_id, display_name, avatar) om het
//      gekoppelde account te tonen
//   3. tokens VERSLEUTELD opslaan in integration_credentials (provider 'tiktok')
//
// De web-callback (/oauth/tiktok/callback) valideert de CSRF-state en
// stuurt alleen de `code` hierheen — de tokens + het client-secret komen
// dus nooit in de web-laag.
//
// TikTok-tokens: access ~24u (expires_in), refresh ~365d (refresh_expires_in).
// De refresh-flow vernieuwt 'm later bij het uploaden (fase 2).
// ============================================================

const PROVIDER = 'tiktok';

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name';

type TikTokTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
};

type TikTokUser = {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
};

@Injectable()
export class TikTokService {
  private readonly logger = new Logger(TikTokService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    private readonly crypto: TokenCryptoService,
  ) {}

  private clientKey(): string {
    const v = this.config.get<string>('TIKTOK_CLIENT_KEY');
    if (!v) throw new InternalServerErrorException('TIKTOK_CLIENT_KEY ontbreekt');
    return v;
  }

  private clientSecret(): string {
    const v = this.config.get<string>('TIKTOK_CLIENT_SECRET');
    if (!v) {
      throw new InternalServerErrorException('TIKTOK_CLIENT_SECRET ontbreekt');
    }
    return v;
  }

  // Stap 1: eenmalige code → access + refresh token.
  // TikTok v2 token-endpoint verwacht application/x-www-form-urlencoded.
  private async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<TikTokTokenResponse> {
    const body = new URLSearchParams({
      client_key: this.clientKey(),
      client_secret: this.clientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await res.json()) as TikTokTokenResponse;
    if (!res.ok || json.error || !json.access_token) {
      this.logger.warn(
        `TikTok code-exchange faalde (${res.status}): ${json.error ?? ''} ${json.error_description ?? ''}`,
      );
      throw new BadRequestException('TikTok-tokenuitwisseling mislukt');
    }
    return json;
  }

  // Vernieuw een access-token met de refresh-token (gebruikt bij upload, fase 2).
  async refreshToken(refreshToken: string): Promise<TikTokTokenResponse> {
    const body = new URLSearchParams({
      client_key: this.clientKey(),
      client_secret: this.clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await res.json()) as TikTokTokenResponse;
    if (!res.ok || json.error || !json.access_token) {
      this.logger.warn(`TikTok token-refresh faalde (${res.status})`);
      throw new BadRequestException('TikTok-token vernieuwen mislukt');
    }
    return json;
  }

  // user.info.basic ophalen om het gekoppelde account te tonen. Fail-soft.
  private async fetchUser(accessToken: string): Promise<TikTokUser | null> {
    try {
      const res = await fetch(USER_INFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { user?: TikTokUser } };
      return json.data?.user ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Wisselt de code om, haalt het account op en slaat de versleutelde
   * tokens op. Eén rij per (restaurant, provider) via upsert.
   */
  async connect(
    restaurantId: string,
    userId: string,
    code: string,
    redirectUri: string,
  ): Promise<{ ok: true }> {
    const token = await this.exchangeCode(code, redirectUri);
    const user = await this.fetchUser(token.access_token);

    const accessEnc = this.crypto.encrypt(token.access_token);
    const refreshEnc = token.refresh_token
      ? this.crypto.encrypt(token.refresh_token)
      : null;
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const { error } = await this.supabase.client
      .from('integration_credentials')
      .upsert(
        {
          restaurant_id: restaurantId,
          provider: PROVIDER,
          access_token_encrypted: accessEnc,
          refresh_token_encrypted: refreshEnc,
          scopes: token.scope ? token.scope.split(',') : [],
          expires_at: expiresAt,
          meta: {
            open_id: token.open_id ?? user?.open_id ?? null,
            display_name: user?.display_name ?? null,
            avatar_url: user?.avatar_url ?? null,
            // refresh verloopt ~1 jaar; bewaren zodat we tijdig kunnen waarschuwen.
            refresh_expires_at: token.refresh_expires_in
              ? new Date(
                  Date.now() + token.refresh_expires_in * 1000,
                ).toISOString()
              : null,
          },
          connected_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,provider' },
      );

    if (error) {
      this.logger.error(
        `Opslaan TikTok integration_credentials faalde: ${error.message}`,
      );
      throw new InternalServerErrorException('Koppeling opslaan mislukt');
    }
    return { ok: true };
  }

  /** Koppelingsstatus (zonder tokens) voor de UI: account + scopes. */
  async status(restaurantId: string): Promise<{
    connected: boolean;
    username?: string | null;
    avatarUrl?: string | null;
    scopes?: string[];
    expiresAt?: string | null;
    updatedAt?: string;
  }> {
    const { data, error } = await this.supabase.client
      .from('integration_credentials')
      .select('scopes, expires_at, updated_at, meta')
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER)
      .maybeSingle();

    if (error) {
      this.logger.error(`TikTok status faalde: ${error.message}`);
      throw new InternalServerErrorException('Status ophalen mislukt');
    }
    if (!data) return { connected: false };
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    return {
      connected: true,
      username: (meta.display_name as string | null) ?? null,
      avatarUrl: (meta.avatar_url as string | null) ?? null,
      scopes: (data.scopes as string[] | null) ?? [],
      expiresAt: (data.expires_at as string | null) ?? null,
      updatedAt: data.updated_at as string | undefined,
    };
  }

  /** Verwijdert de TikTok-koppeling van dit restaurant. */
  async disconnect(restaurantId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client
      .from('integration_credentials')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);

    if (error) {
      this.logger.error(`TikTok disconnect faalde: ${error.message}`);
      throw new InternalServerErrorException('Koppeling verwijderen mislukt');
    }
    return { ok: true };
  }

  // ============================================================
  // Fase 2: Content Posting API (concept naar de inbox)
  // ============================================================

  /**
   * Geldige access-token ophalen: decrypt + automatisch vernieuwen als 'ie
   * verlopen is (TikTok-access-token leeft ~24u). De nieuwe tokens worden
   * versleuteld teruggeschreven.
   */
  async getValidAccessToken(restaurantId: string): Promise<string> {
    const { data, error } = await this.supabase.client
      .from('integration_credentials')
      .select('access_token_encrypted, refresh_token_encrypted, expires_at')
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (error) {
      this.logger.error(`TikTok creds lezen faalde: ${error.message}`);
      throw new InternalServerErrorException('TikTok-koppeling lezen mislukt');
    }
    if (!data) {
      throw new BadRequestException('Geen TikTok-koppeling voor dit restaurant');
    }

    const expiresMs = data.expires_at
      ? new Date(data.expires_at as string).getTime()
      : 0;
    // 60s marge: niet net op de grens een verlopen token gebruiken.
    if (expiresMs && expiresMs - 60_000 > Date.now()) {
      return this.crypto.decrypt(data.access_token_encrypted as string);
    }

    const refreshEnc = data.refresh_token_encrypted as string | null;
    if (!refreshEnc) {
      throw new BadRequestException(
        'TikTok-token verlopen en geen refresh-token; verbind opnieuw',
      );
    }
    const refreshed = await this.refreshToken(this.crypto.decrypt(refreshEnc));
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null;
    await this.supabase.client
      .from('integration_credentials')
      .update({
        access_token_encrypted: this.crypto.encrypt(refreshed.access_token),
        refresh_token_encrypted: refreshed.refresh_token
          ? this.crypto.encrypt(refreshed.refresh_token)
          : refreshEnc,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);
    return refreshed.access_token;
  }

  /**
   * creator_info opvragen — vereist door TikTok's Content-Posting-UX-regels.
   * Levert creator-nickname/avatar + toegestane privacy-opties + max videoduur,
   * die de UI vóór het posten moet tonen (compliance, audit-vereiste).
   */
  async queryCreatorInfo(restaurantId: string): Promise<{
    nickname: string | null;
    avatarUrl: string | null;
    privacyOptions: string[];
    maxDurationSec: number | null;
    commentDisabled: boolean;
    duetDisabled: boolean;
    stitchDisabled: boolean;
  }> {
    const token = await this.getValidAccessToken(restaurantId);
    const res = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      },
    );
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string };
    };
    if (!res.ok || (json.error?.code && json.error.code !== 'ok')) {
      this.logger.warn(
        `TikTok creator_info faalde (${res.status}): ${json.error?.message ?? ''}`,
      );
      throw new BadRequestException('TikTok creator-info ophalen mislukt');
    }
    const d = json.data ?? {};
    return {
      nickname: (d.creator_nickname as string) ?? null,
      avatarUrl: (d.creator_avatar_url as string) ?? null,
      privacyOptions: (d.privacy_level_options as string[]) ?? [],
      maxDurationSec: (d.max_video_post_duration_sec as number) ?? null,
      commentDisabled: Boolean(d.comment_disabled),
      duetDisabled: Boolean(d.duet_disabled),
      stitchDisabled: Boolean(d.stitch_disabled),
    };
  }

  /**
   * Stuurt een video als CONCEPT naar de TikTok-inbox (video.upload-scope,
   * inbox-route). De eigenaar voltooit + publiceert zelf vanuit de TikTok-app.
   *
   * Gebruikt PULL_FROM_URL: TikTok haalt het bestand op van `videoUrl`.
   * ⚠️ Het DOMEIN van videoUrl moet in het TikTok-portal geverifieerd zijn
   * (get-filly.com). Een Supabase-storage-URL (*.supabase.co) werkt dus niet
   * direct — serveer de media via een get-filly.com-route (zie BACKLOG-todo).
   */
  async postToInbox(
    restaurantId: string,
    videoUrl: string,
  ): Promise<{ publishId: string }> {
    const token = await this.getValidAccessToken(restaurantId);
    const res = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
        }),
      },
    );
    const json = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    if (
      !res.ok ||
      (json.error?.code && json.error.code !== 'ok') ||
      !json.data?.publish_id
    ) {
      this.logger.warn(
        `TikTok inbox-upload faalde (${res.status}): ${json.error?.code ?? ''} ${json.error?.message ?? ''}`,
      );
      throw new BadRequestException('TikTok-upload mislukt');
    }
    return { publishId: json.data.publish_id };
  }
}
