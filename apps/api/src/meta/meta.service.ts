import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
// Per-request user-JWT-client (RLS actief). De RLS-policies op
// integration_credentials beperken alles tot rijen van het restaurant
// waar de ingelogde user lid van is.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
// Service-role-client (RLS-bypass). Nodig voor de Meta-callbacks
// (deauthorize / data-deletion): die komen zónder ingelogde user
// binnen, dus er is geen JWT om RLS mee te draaien.
import { SupabaseService } from '../supabase/supabase.service';
import { TokenCryptoService } from '../common/token-crypto.service';
import { parseSignedRequest } from './meta-signed-request';

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

// ---- Social-insights (fase 1: live engagement, geen reach/impressions) ----
export type MetaPostStat = {
  id: string;
  message: string | null;
  createdTime: string | null;
  permalink: string | null;
  likes: number;
  comments: number;
  shares: number;
};

export type MetaIgPostStat = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  timestamp: string | null;
  permalink: string | null;
  likeCount: number;
  commentsCount: number;
};

export type MetaInsights = {
  pageSelected: boolean;
  pageName?: string;
  facebook: { posts: MetaPostStat[] } | null;
  instagram: {
    username: string | null;
    followersCount: number | null;
    mediaCount: number | null;
    posts: MetaIgPostStat[];
  } | null;
  // Toelichtingen waarom (een deel van) de data ontbreekt.
  notes: string[];
};

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: RequestSupabaseService,
    private readonly admin: SupabaseService,
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

  // Haalt de daadwerkelijk toegekende permissies op (GET /me/permissions).
  // Fail-soft: bij een fout een lege lijst, dan slaan we gewoon niets op.
  private async fetchGrantedScopes(accessToken: string): Promise<string[]> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphVersion()}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        data?: Array<{ permission: string; status: string }>;
      };
      return (data.data ?? [])
        .filter((p) => p.status === 'granted')
        .map((p) => p.permission);
    } catch {
      return [];
    }
  }

  // Haalt het Meta-user-id op (GET /me). Fail-soft: bij een fout
  // null, dan slaan we 'm gewoon niet op (deauth/deletion vinden de
  // rij dan niet, maar de koppeling zelf werkt wel).
  private async fetchMetaUserId(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.graphVersion()}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string };
      return data.id ?? null;
    } catch {
      return null;
    }
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

    // Meta-user-id opslaan: dat hebben de deauthorize- en
    // data-deletion-callbacks nodig om de juiste rij te vinden (Meta
    // identificeert daar op user_id, niet op ons restaurant-id).
    const metaUserId = await this.fetchMetaUserId(long.access_token);
    // Toegekende permissies opslaan zodat de UI/diagnose kan tonen wat de
    // eigenaar daadwerkelijk heeft goedgekeurd (bv. ontbrekende
    // instagram_content_publish-scope verklaart waarom IG niet werkt).
    const grantedScopes = await this.fetchGrantedScopes(long.access_token);

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
          scopes: grantedScopes,
          expires_at: expiresAt,
          meta: metaUserId ? { meta_user_id: metaUserId } : {},
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

  /**
   * Koppelingsstatus (zonder de token zelf) voor de UI.
   * `useAdmin` = true gebruikt de service-role-client i.p.v. de request-
   * client; nodig voor context-loze flows (bv. de campagne-cron).
   */
  async status(
    restaurantId: string,
    useAdmin = false,
  ): Promise<{
    connected: boolean;
    scopes?: string[];
    expiresAt?: string | null;
    updatedAt?: string;
    page?: { id: string; name: string } | null;
    // Token verlopen volgens de opgeslagen expires_at? Dan moet de eigenaar
    // opnieuw verbinden — de UI toont "Herverbinden nodig" en publiceren
    // faalt tot er een verse token is. Cheap signaal (geen Graph-call).
    expired?: boolean;
  }> {
    const client = useAdmin ? this.admin.client : this.supabase.client;
    const { data, error } = await client
      .from('integration_credentials')
      .select('scopes, expires_at, updated_at, meta')
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
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    const page = meta.page_id
      ? {
          id: meta.page_id as string,
          name: (meta.page_name as string | undefined) ?? '',
        }
      : null;
    const expiresAt = data.expires_at as string | null;
    const expired = !!expiresAt && new Date(expiresAt).getTime() < Date.now();
    return {
      connected: true,
      scopes: data.scopes as string[],
      expiresAt,
      updatedAt: data.updated_at as string,
      page,
      expired,
    };
  }

  // ----------------------------------------------------------------
  // Publiceren (stap 4): pagina's ophalen, pagina kiezen, posten
  // ----------------------------------------------------------------
  // Posten gebeurt met een PAGE-access-token. Die slaan we NIET op:
  // we halen 'm telkens vers op via /me/accounts met de (opgeslagen,
  // ontsleutelde) user-token. Zo staat er één geheim minder in de DB.

  // Haalt + ontsleutelt de user-token + meta-jsonb van dit restaurant.
  private async loadCredential(
    restaurantId: string,
    useAdmin = false,
  ): Promise<{ token: string; meta: Record<string, unknown> }> {
    const client = useAdmin ? this.admin.client : this.supabase.client;
    const { data, error } = await client
      .from('integration_credentials')
      .select('access_token_encrypted, meta')
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER)
      .maybeSingle();
    if (error) {
      this.logger.error(`Koppeling ophalen faalde: ${error.message}`);
      throw new InternalServerErrorException('Koppeling ophalen mislukt');
    }
    if (!data) {
      throw new BadRequestException('Geen Meta-koppeling voor dit restaurant');
    }
    return {
      token: this.crypto.decrypt(data.access_token_encrypted as string),
      meta: (data.meta ?? {}) as Record<string, unknown>,
    };
  }

  // Pagina's die de user beheert, mét page-token + gekoppeld IG-account.
  private async fetchAccounts(userToken: string): Promise<
    Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>
  > {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion()}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Meta /me/accounts faalde (${res.status}): ${body}`);
      throw new BadRequestException('Pagina-lijst ophalen mislukt');
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    };
    return json.data ?? [];
  }

  /** Lijst van Facebook-pagina's (zonder de page-token naar de client). */
  async listPages(
    restaurantId: string,
  ): Promise<Array<{ id: string; name: string; hasInstagram: boolean }>> {
    const { token } = await this.loadCredential(restaurantId);
    const accounts = await this.fetchAccounts(token);
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      hasInstagram: !!a.instagram_business_account?.id,
    }));
  }

  /** Kiest de pagina waarop we publiceren; bewaart id + IG-account in meta. */
  async selectPage(
    restaurantId: string,
    pageId: string,
  ): Promise<{ ok: true }> {
    const { token, meta } = await this.loadCredential(restaurantId);
    const accounts = await this.fetchAccounts(token);
    const page = accounts.find((a) => a.id === pageId);
    if (!page) {
      throw new BadRequestException('Pagina niet gevonden onder dit account');
    }
    const nextMeta = {
      ...meta,
      page_id: page.id,
      page_name: page.name,
      ig_user_id: page.instagram_business_account?.id ?? null,
    };
    const { error } = await this.supabase.client
      .from('integration_credentials')
      .update({ meta: nextMeta, updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId)
      .eq('provider', PROVIDER);
    if (error) {
      this.logger.error(`Pagina opslaan faalde: ${error.message}`);
      throw new InternalServerErrorException('Pagina opslaan mislukt');
    }
    return { ok: true };
  }

  /**
   * Publiceert een bericht op de gekozen Facebook-pagina en/of het
   * gekoppelde Instagram-account. IG vereist een afbeelding-URL.
   */
  async publish(
    restaurantId: string,
    opts: {
      message: string;
      imageUrl?: string;
      toFacebook: boolean;
      toInstagram: boolean;
    },
    useAdmin = false,
  ): Promise<{
    facebook?: { id: string };
    instagram?: { id: string };
    errors: string[];
  }> {
    const { token, meta } = await this.loadCredential(restaurantId, useAdmin);
    const pageId = meta.page_id as string | undefined;
    const igUserId = (meta.ig_user_id as string | null | undefined) ?? null;
    if (!pageId) {
      throw new BadRequestException('Kies eerst een Facebook-pagina');
    }

    // Verse page-token ophalen (niet opgeslagen).
    const accounts = await this.fetchAccounts(token);
    const page = accounts.find((a) => a.id === pageId);
    if (!page) {
      throw new BadRequestException(
        'Gekozen pagina niet meer beschikbaar; kies opnieuw',
      );
    }
    const pageToken = page.access_token;
    const v = this.graphVersion();
    const result: {
      facebook?: { id: string };
      instagram?: { id: string };
      errors: string[];
    } = { errors: [] };

    // --- Facebook ---
    if (opts.toFacebook) {
      try {
        if (opts.imageUrl) {
          // Foto-post op de pagina.
          const params = new URLSearchParams({
            url: opts.imageUrl,
            caption: opts.message,
            access_token: pageToken,
          });
          const res = await fetch(
            `https://graph.facebook.com/${v}/${pageId}/photos`,
            { method: 'POST', body: params },
          );
          const json = (await res.json()) as { id?: string; post_id?: string };
          if (!res.ok) throw new Error(JSON.stringify(json));
          result.facebook = { id: json.post_id ?? json.id ?? '' };
        } else {
          // Tekst/link-post op de pagina-feed.
          const params = new URLSearchParams({
            message: opts.message,
            access_token: pageToken,
          });
          const res = await fetch(
            `https://graph.facebook.com/${v}/${pageId}/feed`,
            { method: 'POST', body: params },
          );
          const json = (await res.json()) as { id?: string };
          if (!res.ok) throw new Error(JSON.stringify(json));
          result.facebook = { id: json.id ?? '' };
        }
      } catch (err) {
        this.logger.warn(`FB-publicatie faalde: ${String(err)}`);
        result.errors.push('Facebook-publicatie mislukt');
      }
    }

    // --- Instagram (2 stappen: container → publish; vereist afbeelding) ---
    if (opts.toInstagram) {
      if (!igUserId) {
        result.errors.push('Geen Instagram-account gekoppeld aan deze pagina');
      } else if (!opts.imageUrl) {
        result.errors.push('Instagram vereist een afbeelding-URL');
      } else {
        try {
          const createParams = new URLSearchParams({
            image_url: opts.imageUrl,
            caption: opts.message,
            access_token: pageToken,
          });
          const createRes = await fetch(
            `https://graph.facebook.com/${v}/${igUserId}/media`,
            { method: 'POST', body: createParams },
          );
          const createJson = (await createRes.json()) as { id?: string };
          if (!createRes.ok) throw new Error(JSON.stringify(createJson));

          const pubParams = new URLSearchParams({
            creation_id: createJson.id ?? '',
            access_token: pageToken,
          });
          const pubRes = await fetch(
            `https://graph.facebook.com/${v}/${igUserId}/media_publish`,
            { method: 'POST', body: pubParams },
          );
          const pubJson = (await pubRes.json()) as { id?: string };
          if (!pubRes.ok) throw new Error(JSON.stringify(pubJson));
          result.instagram = { id: pubJson.id ?? '' };
        } catch (err) {
          this.logger.warn(`IG-publicatie faalde: ${String(err)}`);
          result.errors.push('Instagram-publicatie mislukt');
        }
      }
    }

    return result;
  }

  /**
   * Fase 1 social-insights: live engagement van de gekoppelde FB-pagina +
   * IG-account. Werkt met de bestaande scopes (pages_read_engagement +
   * instagram_basic) — likes/reacties/shares per post + IG-volgers/media-
   * count. Reach/impressions/profielweergaven komen pas met read_insights /
   * instagram_manage_insights (fase 2, nieuwe App Review).
   * Fail-soft per kanaal: een fout in FB blokkeert IG niet, en andersom.
   */
  async getInsights(restaurantId: string): Promise<MetaInsights> {
    const { token, meta } = await this.loadCredential(restaurantId);
    const pageId = (meta.page_id as string | undefined) ?? undefined;
    const igUserId = (meta.ig_user_id as string | null | undefined) ?? null;
    const notes: string[] = [];

    if (!pageId) {
      return {
        pageSelected: false,
        facebook: null,
        instagram: null,
        notes: ['Kies eerst een Facebook-pagina onder Account → Koppelingen.'],
      };
    }

    // Verse page-token (telkens via /me/accounts, net als publish).
    const accounts = await this.fetchAccounts(token);
    const page = accounts.find((a) => a.id === pageId);
    if (!page) {
      throw new BadRequestException(
        'De gekozen Facebook-pagina is niet meer beschikbaar. Kies opnieuw een pagina.',
      );
    }
    const pageToken = page.access_token;
    const v = this.graphVersion();

    const facebook = await this.fetchFacebookStats(v, pageId, pageToken, notes);
    let instagram: MetaInsights['instagram'] = null;
    if (igUserId) {
      instagram = await this.fetchInstagramStats(v, igUserId, pageToken, notes);
    } else {
      notes.push('Geen Instagram-account gekoppeld aan deze pagina.');
    }

    return { pageSelected: true, pageName: page.name, facebook, instagram, notes };
  }

  // FB-pagina: gepubliceerde posts + engagement (likes/reacties/shares).
  private async fetchFacebookStats(
    v: string,
    pageId: string,
    pageToken: string,
    notes: string[],
  ): Promise<{ posts: MetaPostStat[] } | null> {
    try {
      const fields =
        'id,message,created_time,permalink_url,' +
        'likes.summary(true),comments.summary(true),shares';
      const res = await fetch(
        `https://graph.facebook.com/${v}/${pageId}/published_posts?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(pageToken)}`,
      );
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Meta FB-stats ${res.status}: ${body.slice(0, 300)}`);
        notes.push('Facebook-statistieken konden niet worden opgehaald.');
        return null;
      }
      const json = (await res.json()) as {
        data?: Array<{
          id: string;
          message?: string;
          created_time?: string;
          permalink_url?: string;
          likes?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          shares?: { count?: number };
        }>;
      };
      const posts = (json.data ?? []).map((p) => ({
        id: p.id,
        message: p.message ?? null,
        createdTime: p.created_time ?? null,
        permalink: p.permalink_url ?? null,
        likes: p.likes?.summary?.total_count ?? 0,
        comments: p.comments?.summary?.total_count ?? 0,
        shares: p.shares?.count ?? 0,
      }));
      return { posts };
    } catch (err) {
      this.logger.warn(`Meta FB-stats fout: ${(err as Error).message}`);
      notes.push('Facebook-statistieken konden niet worden opgehaald.');
      return null;
    }
  }

  // IG-account: basisvelden (volgers/media-count) + recente media + engagement.
  private async fetchInstagramStats(
    v: string,
    igUserId: string,
    pageToken: string,
    notes: string[],
  ): Promise<MetaInsights['instagram']> {
    try {
      const acctRes = await fetch(
        `https://graph.facebook.com/${v}/${igUserId}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(pageToken)}`,
      );
      let username: string | null = null;
      let followersCount: number | null = null;
      let mediaCount: number | null = null;
      if (acctRes.ok) {
        const a = (await acctRes.json()) as {
          username?: string;
          followers_count?: number;
          media_count?: number;
        };
        username = a.username ?? null;
        followersCount = a.followers_count ?? null;
        mediaCount = a.media_count ?? null;
      } else {
        const body = await acctRes.text();
        this.logger.warn(`Meta IG-account ${acctRes.status}: ${body.slice(0, 300)}`);
      }

      const mediaFields =
        'id,caption,media_type,timestamp,permalink,like_count,comments_count';
      const mediaRes = await fetch(
        `https://graph.facebook.com/${v}/${igUserId}/media?fields=${encodeURIComponent(mediaFields)}&limit=25&access_token=${encodeURIComponent(pageToken)}`,
      );
      let posts: MetaIgPostStat[] = [];
      if (mediaRes.ok) {
        const m = (await mediaRes.json()) as {
          data?: Array<{
            id: string;
            caption?: string;
            media_type?: string;
            timestamp?: string;
            permalink?: string;
            like_count?: number;
            comments_count?: number;
          }>;
        };
        posts = (m.data ?? []).map((p) => ({
          id: p.id,
          caption: p.caption ?? null,
          mediaType: p.media_type ?? null,
          timestamp: p.timestamp ?? null,
          permalink: p.permalink ?? null,
          likeCount: p.like_count ?? 0,
          commentsCount: p.comments_count ?? 0,
        }));
      } else {
        const body = await mediaRes.text();
        this.logger.warn(`Meta IG-media ${mediaRes.status}: ${body.slice(0, 300)}`);
        notes.push('Instagram-statistieken konden niet volledig worden opgehaald.');
      }

      return { username, followersCount, mediaCount, posts };
    } catch (err) {
      this.logger.warn(`Meta IG-stats fout: ${(err as Error).message}`);
      notes.push('Instagram-statistieken konden niet worden opgehaald.');
      return null;
    }
  }

  /**
   * Trekt een eerder geplaatste post terug (campagne actief → concept).
   *   - Facebook: post echt verwijderen via DELETE /{post-id} met een
   *     verse page-token.
   *   - Instagram: de Graph API kent GÉÉN delete voor geplaatste media,
   *     dus dat kan niet via de API. We melden dat de eigenaar de
   *     IG-post handmatig moet verwijderen (`instagramManual: true`).
   * Fail-soft: een mislukte FB-delete blokkeert de terugtrekking in onze
   * eigen DB niet (caller logt/negeert).
   */
  async retract(
    restaurantId: string,
    postIds: { facebook?: string | null; instagram?: string | null },
  ): Promise<{
    facebookDeleted: boolean;
    instagramManual: boolean;
    errors: string[];
  }> {
    const result = { facebookDeleted: false, instagramManual: false, errors: [] as string[] };

    if (postIds.facebook) {
      try {
        const { token, meta } = await this.loadCredential(restaurantId);
        const pageId = meta.page_id as string | undefined;
        const accounts = await this.fetchAccounts(token);
        const page = accounts.find((a) => a.id === pageId);
        if (!page) {
          throw new Error('gekoppelde pagina niet meer beschikbaar');
        }
        const res = await fetch(
          `https://graph.facebook.com/${this.graphVersion()}/${postIds.facebook}?access_token=${encodeURIComponent(page.access_token)}`,
          { method: 'DELETE' },
        );
        const json = (await res.json()) as { success?: boolean; error?: unknown };
        if (!res.ok) throw new Error(JSON.stringify(json));
        result.facebookDeleted = true;
      } catch (err) {
        this.logger.warn(`FB-post verwijderen faalde: ${String(err)}`);
        result.errors.push('Facebook-post verwijderen mislukt');
      }
    }

    // Instagram-media kan niet via de API verwijderd worden → handmatig.
    if (postIds.instagram) {
      result.instagramManual = true;
    }

    return result;
  }

  // ----------------------------------------------------------------
  // Meta-callbacks (server-to-server, GEEN ingelogde user)
  // ----------------------------------------------------------------
  // Beide verifiëren de signed_request met het App Secret en
  // verwijderen via de SERVICE-ROLE-client (admin), want er is geen
  // JWT/sessie. We matchen op het opgeslagen meta_user_id.

  /**
   * Deauthorize-callback: Meta meldt dat een gebruiker de app heeft
   * losgekoppeld. We ruimen de opgeslagen koppeling(en) van die
   * Meta-user op.
   */
  async deauthorize(signedRequest: string): Promise<{ ok: true }> {
    const payload = parseSignedRequest(signedRequest, this.appSecret());
    if (!payload) {
      throw new BadRequestException('Ongeldige signed_request');
    }
    const metaUserId = payload.user_id;
    if (!metaUserId) return { ok: true }; // niets om op te ruimen

    const { error } = await this.admin.client
      .from('integration_credentials')
      .delete()
      .eq('provider', PROVIDER)
      .eq('meta->>meta_user_id', metaUserId);

    if (error) {
      this.logger.error(`Deauthorize-verwijdering faalde: ${error.message}`);
      throw new InternalServerErrorException('Verwijderen mislukt');
    }
    this.logger.log(`Meta deauthorize verwerkt voor user ${metaUserId}`);
    return { ok: true };
  }

  /**
   * Data-deletion-callback (AVG/GDPR): Meta vraagt verwijdering van
   * alle data van een gebruiker. We verwijderen de koppeling(en) en
   * geven het door Meta vereiste { url, confirmation_code } terug.
   */
  async requestDataDeletion(
    signedRequest: string,
  ): Promise<{ url: string; confirmation_code: string }> {
    const payload = parseSignedRequest(signedRequest, this.appSecret());
    if (!payload) {
      throw new BadRequestException('Ongeldige signed_request');
    }

    const code = randomUUID();
    const metaUserId = payload.user_id;

    if (metaUserId) {
      const { error } = await this.admin.client
        .from('integration_credentials')
        .delete()
        .eq('provider', PROVIDER)
        .eq('meta->>meta_user_id', metaUserId);

      if (error) {
        this.logger.error(
          `Data-deletion-verwijdering faalde: ${error.message}`,
        );
        throw new InternalServerErrorException('Verwijderen mislukt');
      }
    }

    // Bewust de canonieke publieke URL (NIET WEB_URL): die kan op een
    // Vercel-preview-domein staan, maar Meta + de gebruiker horen
    // www.get-filly.com te zien. Eén plek aanpassen als het domein wijzigt.
    const base = 'https://www.get-filly.com';
    this.logger.log(
      `Meta data-deletion verwerkt (code ${code}) voor user ${metaUserId ?? 'onbekend'}`,
    );
    return {
      url: `${base}/data-deletion-status?id=${code}`,
      confirmation_code: code,
    };
  }
}
