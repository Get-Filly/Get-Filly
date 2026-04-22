import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  type Module,
  type Role,
  type StoredPermissions,
  resolvePermissions,
} from '@getfilly/shared';

/**
 * ============================================================
 * RestaurantAccessService
 * ============================================================
 *
 * Centrale plek voor alle vragen rond "mag deze user bij dit
 * restaurant?" en "welke modules mag hij zien?".
 *
 * Gebruik:
 *   - @RestaurantId() in controllers → roept dit onder water aan
 *     om toegang te verifiëren.
 *   - GET /me/restaurants → gebruikt getUserRestaurants()
 *   - Later: team-management UI gebruikt deze ook voor de lijst
 *     van gekoppelde users.
 */

/**
 * Wat we over één restaurant-koppeling weten:
 *   - het restaurant zelf (id + naam, handig voor UI)
 *   - de rol van de user binnen dat restaurant
 *   - de uiteindelijke permissies (na toepassing van defaults)
 */
export type RestaurantAccess = {
  restaurantId: string;
  restaurantName: string;
  role: Role;
  permissions: readonly Module[];
};

@Injectable()
export class RestaurantAccessService {
  private readonly logger = new Logger(RestaurantAccessService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Haal alle restaurants op waar deze user toegang toe heeft.
   * Returned per restaurant de rol + effectieve permissies.
   *
   * Wordt gebruikt door GET /me/restaurants om de frontend te laten
   * weten: "dit zijn jouw restaurants, dit mag je per restaurant".
   */
  async getUserRestaurants(userId: string): Promise<RestaurantAccess[]> {
    // We joinen restaurant_users met restaurants zodat we de naam
    // meteen meekrijgen — scheelt een tweede query.
    //
    // Supabase's JS-SDK gebruikt de PostgREST-syntax voor joins:
    //   select('role, permissions, restaurants(id, name)')
    // Dit doet een embed: je krijgt per rij een "restaurants" veld
    // met het gekoppelde restaurant-record.
    const { data, error } = await this.supabase.client
      .from('restaurant_users')
      .select('role, permissions, restaurants(id, name)')
      .eq('user_id', userId);

    if (error) {
      this.logger.error(
        `Kon restaurants niet ophalen voor user ${userId}: ${error.message}`,
      );
      throw error;
    }

    // Vorm de ruwe DB-rijen om naar onze RestaurantAccess-structuur.
    // We filteren stille fouten (ontbrekende restaurant-koppeling) eruit.
    //
    // Cast via `unknown` omdat Supabase's TS-types voor joins vrij
    // los zijn (ze modelleren ook een edge-case waarin het embed-veld
    // een array kan zijn). We weten hier zeker dat het één restaurant
    // per rij is (FK-relatie 1-op-veel van restaurants naar
    // restaurant_users), dus we forceren het type.
    const rows = (data ?? []) as unknown as Array<{
      role: Role;
      permissions: StoredPermissions | null;
      restaurants: { id: string; name: string } | null;
    }>;

    return rows
      .filter((row) => row.restaurants !== null)
      .map((row) => ({
        restaurantId: row.restaurants!.id,
        restaurantName: row.restaurants!.name,
        role: row.role,
        permissions: resolvePermissions(row.role, row.permissions),
      }));
  }

  /**
   * Verifieer dat de user toegang heeft tot het gegeven restaurant.
   * Returned rol + permissies als het klopt; gooit 403/404 als niet.
   *
   * Dit is DE poortwachter voor multi-tenant isolatie:
   *   - User kent geen rij in restaurant_users voor dit restaurant?
   *     → 403 Forbidden (je mag hier niet zijn).
   *   - Restaurant bestaat niet?
   *     → 404 Not Found.
   *   - Alles klopt? → geef context terug.
   */
  async requireAccess(
    userId: string,
    restaurantId: string,
  ): Promise<RestaurantAccess> {
    // Stap 1: bestaat het restaurant überhaupt?
    // (Service_role bypasst RLS, dus we zien het altijd als het bestaat.)
    const { data: restaurant, error: restErr } = await this.supabase.client
      .from('restaurants')
      .select('id, name')
      .eq('id', restaurantId)
      .maybeSingle();

    if (restErr) {
      this.logger.error(
        `Fout bij ophalen restaurant ${restaurantId}: ${restErr.message}`,
      );
      throw restErr;
    }
    if (!restaurant) {
      throw new NotFoundException('Restaurant niet gevonden.');
    }

    // Stap 2: heeft de user een koppeling in restaurant_users?
    const { data: link, error: linkErr } = await this.supabase.client
      .from('restaurant_users')
      .select('role, permissions')
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (linkErr) {
      this.logger.error(
        `Fout bij ophalen access user ${userId} → restaurant ${restaurantId}: ${linkErr.message}`,
      );
      throw linkErr;
    }
    if (!link) {
      // Bewust generieke boodschap zonder te lekken of het restaurant
      // bestaat — alleen "geen toegang".
      throw new ForbiddenException(
        'Geen toegang tot dit restaurant.',
      );
    }

    const typed = link as { role: Role; permissions: StoredPermissions | null };

    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      role: typed.role,
      permissions: resolvePermissions(typed.role, typed.permissions),
    };
  }
}
