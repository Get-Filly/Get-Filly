import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { Module, Role, StoredPermissions } from '@getfilly/shared';

/**
 * ============================================================
 * TeamService — beheer van teamleden binnen een restaurant
 * ============================================================
 *
 * Deze service is de plek voor alle team-management-logica:
 *   - Lijst van gekoppelde users ophalen
 *   - Rol of permissies van een user aanpassen
 *   - User ontkoppelen (verwijderen uit het team)
 *
 * Veiligheids-regels:
 *   - Alleen owners mogen wijzigingen maken (check doet de controller).
 *   - Je kunt jezelf niet verwijderen — dat doet de controller ook.
 *   - Het laatste owner-account mag niet op een lagere rol gezet
 *     of verwijderd worden (anders is er niemand meer die het team
 *     kan beheren). Die check doet deze service zelf.
 */

/**
 * Type dat we teruggeven aan de frontend per teamlid.
 */
export type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  permissions: StoredPermissions | null;
  created_at: string;
};

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Haalt alle teamleden voor een restaurant op.
   * Roept de get_restaurant_members RPC aan (zie migratie 0007) —
   * die joint restaurant_users met public.users en auth.users.
   */
  async listMembers(restaurantId: string): Promise<TeamMember[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_restaurant_members',
      { rid: restaurantId },
    );

    if (error) {
      this.logger.error(
        `Kon teamleden niet ophalen voor restaurant ${restaurantId}: ${error.message}`,
      );
      throw error;
    }

    return (data ?? []) as TeamMember[];
  }

  /**
   * Wijzig rol en/of custom permissions voor een bestaande user-
   * koppeling. Gebruikt voor de "beheer team"-tab op de account-pagina.
   *
   * Beveiliging tegen "laatste owner weg":
   *   Als we een owner gaan downgraden of verwijderen, checken we
   *   eerst of er nog minstens één andere owner overblijft.
   */
  async updateMember(
    restaurantId: string,
    userId: string,
    updates: { role?: Role; permissions?: Module[] | null },
  ): Promise<TeamMember> {
    // Haal huidige koppeling op (nodig voor laatste-owner-check).
    const { data: existing, error: existErr } = await this.supabase.client
      .from('restaurant_users')
      .select('role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) throw new NotFoundException('Teamlid niet gevonden.');

    // Als we een owner gaan downgraden: mag alleen als er een andere owner is.
    if (existing.role === 'owner' && updates.role && updates.role !== 'owner') {
      await this.assertNotLastOwner(restaurantId, userId);
    }

    // Bouw de update-payload. Alleen velden meesturen die echt zijn
    // opgegeven (anders overschrijven we waardes met undefined → null).
    const patch: {
      role?: Role;
      permissions?: StoredPermissions | null;
    } = {};

    if (updates.role !== undefined) patch.role = updates.role;

    if (updates.permissions !== undefined) {
      // null of lege array → "gebruik rol-defaults" (custom permissions uit).
      patch.permissions =
        updates.permissions === null || updates.permissions.length === 0
          ? null
          : { modules: updates.permissions };
    }

    const { data, error } = await this.supabase.client
      .from('restaurant_users')
      .update(patch)
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Haal de volledige member-row opnieuw op (incl. email/full_name)
    // zodat de frontend direct een complete TeamMember terugkrijgt.
    const list = await this.listMembers(restaurantId);
    const updated = list.find((m) => m.user_id === userId);
    if (!updated) throw new NotFoundException('Teamlid niet gevonden na update.');
    return updated;
  }

  /**
   * Verwijder een user uit het team. Owner kan niet zichzelf verwijderen
   * — dat doet de controller (kent current user). Hier checken we dat
   * we niet de laatste owner ontkoppelen.
   */
  async removeMember(restaurantId: string, userId: string): Promise<void> {
    const { data: existing, error: existErr } = await this.supabase.client
      .from('restaurant_users')
      .select('role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) throw new NotFoundException('Teamlid niet gevonden.');

    if (existing.role === 'owner') {
      await this.assertNotLastOwner(restaurantId, userId);
    }

    const { error } = await this.supabase.client
      .from('restaurant_users')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Interne check: weigert de actie als het verwijderen/downgraden
   * van deze user zou betekenen dat er geen owners meer overblijven.
   */
  private async assertNotLastOwner(
    restaurantId: string,
    userIdBeingChanged: string,
  ): Promise<void> {
    const { count, error } = await this.supabase.client
      .from('restaurant_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('role', 'owner')
      .neq('user_id', userIdBeingChanged);

    if (error) throw error;

    if (!count || count === 0) {
      throw new BadRequestException(
        'Dit is de enige eigenaar. Maak eerst iemand anders eigenaar voordat je deze rol wijzigt of verwijdert.',
      );
    }
  }
}
