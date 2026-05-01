import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * ============================================================
 * RequestSupabaseService — per-request user-scoped Supabase client
 * ============================================================
 *
 * Wat is dit?
 *   Een Supabase-client die het JWT van de ingelogde user meestuurt
 *   bij ELKE database-call. Daardoor draait de query als die user en
 *   pakken alle Row Level Security (RLS) policies hun werk via
 *   `auth.uid()`. Een user van restaurant A kan dus geen rijen van
 *   restaurant B zien — ook niet als de backend-code zou falen in
 *   z'n eigen filter (defense-in-depth).
 *
 * Waarom Scope.REQUEST?
 *   Een normale NestJS-provider is een singleton (1× per app-start).
 *   Maar het user-token verschilt per request — dus moeten we een
 *   verse client per request hebben. NestJS regelt dit door bij elke
 *   inkomende HTTP-request een nieuwe instance van deze service +
 *   alle services die 'm injecteren te bouwen.
 *
 *   Performance-impact: minimaal voor onze API. Service-instantiation
 *   is goedkoop; de Supabase-client is een lichte HTTP-wrapper.
 *
 * Wanneer wel/niet gebruiken?
 *   ✅ Gebruiken in services die data lezen/schrijven NAMENS de user
 *      (MenuService, ReviewsService, GuestsService, etc.).
 *   ❌ NIET gebruiken voor admin-flows die bewust RLS bypassen:
 *      - AuditLogService (audit moet altijd schrijven)
 *      - AnonymizationService (background, geen user-context)
 *      - AccountDeletionService (verwijdert auth.users)
 *      - OnboardingService bij restaurant-creatie (link bestaat nog niet)
 *      - ai_usage logging zonder restaurant_id
 *      Die blijven SupabaseService (service_role) gebruiken.
 *
 * Hoe te gebruiken in een service:
 *
 *   @Injectable()
 *   export class MenuService {
 *     constructor(private readonly supabase: RequestSupabaseService) {}
 *
 *     async list(restaurantId: string) {
 *       // Geen .eq('restaurant_id', ...) meer nodig om security
 *       // af te dwingen — RLS doet dat. Je MAG het wel houden voor
 *       // duidelijkheid, maar het is geen veiligheidsmaatregel meer.
 *       const { data, error } = await this.supabase.client
 *         .from('menu_items')
 *         .select('*')
 *         .eq('restaurant_id', restaurantId);
 *       // ...
 *     }
 *   }
 *
 * Important: de module die deze service injecteert MOET zelf ook
 * Scope.REQUEST krijgen, of de injectie faalt. NestJS lost dat
 * automatisch op zolang je de hele provider-keten via deze service
 * injecteert.
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestSupabaseService {
  // We bouwen de Supabase-client lazy — pas bij de eerste .client-toegang.
  // Reden: een controller die deze service injecteert maar 'm in een
  // bepaalde flow niet gebruikt (bv. een no-token health-check) kost
  // dan geen createClient-call.
  private cachedClient: SupabaseClient | null = null;

  constructor(
    private readonly config: ConfigService,
    // @Inject(REQUEST) geeft ons het inkomende HTTP-request-object van
    // NestJS. We typen het minimaal — alleen het veld dat de AuthGuard
    // er op heeft gezet.
    @Inject(REQUEST)
    private readonly request: { accessToken?: string },
  ) {}

  /**
   * Geeft een Supabase-client terug die alle calls authenticeert als
   * de ingelogde user. RLS-policies gebruiken auth.uid() en blokkeren
   * cross-tenant lookups automatisch.
   *
   * Gooit 401 als er geen token op het request staat — dat zou alleen
   * kunnen gebeuren als deze service per ongeluk in een @Public()
   * endpoint wordt gebruikt. In dat geval wil je expliciet
   * SupabaseService (service_role) gebruiken, niet deze.
   */
  get client(): SupabaseClient {
    if (this.cachedClient) {
      return this.cachedClient;
    }

    const token = this.request.accessToken;
    if (!token) {
      throw new UnauthorizedException(
        'RequestSupabaseService gebruikt op een endpoint zonder Authorization-header. ' +
          'Op @Public() endpoints hoor je SupabaseService (service_role) te gebruiken.',
      );
    }

    const url = this.config.get<string>('SUPABASE_URL');
    // We gebruiken hier bewust de PUBLIEKE publishable-key (vroeger
    // "anon" genoemd), niet de service-role/secret-key. De client
    // wordt door het Authorization-header gepromoveerd tot user-niveau;
    // de service-role zou RLS bypassen — precies wat we willen voorkomen.
    const publishableKey = this.config.get<string>('SUPABASE_PUBLISHABLE_KEY');

    if (!url || !publishableKey) {
      throw new Error(
        'SUPABASE_URL of SUPABASE_PUBLISHABLE_KEY ontbreken in .env — nodig voor de per-request client.',
      );
    }

    this.cachedClient = createClient(url, publishableKey, {
      auth: {
        // We managen de sessie zelf via het meegestuurde token.
        // Geen lokale storage / refresh-flow nodig in een server-context.
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          // Hier gebeurt de magie: PostgREST ziet dit token, valideert
          // 'm intern bij Supabase, en draait de query als die user.
          // RLS-policies hebben nu een echte auth.uid() om mee te werken.
          Authorization: `Bearer ${token}`,
        },
      },
    });

    return this.cachedClient;
  }
}
