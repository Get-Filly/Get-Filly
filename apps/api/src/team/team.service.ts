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
 * TeamService, beheer van teamleden binnen een restaurant
 * ============================================================
 *
 * Deze service is de plek voor alle team-management-logica:
 *   - Lijst van gekoppelde users ophalen
 *   - Rol of permissies van een user aanpassen
 *   - User ontkoppelen (verwijderen uit het team)
 *
 * Veiligheids-regels:
 *   - Alleen owners mogen wijzigingen maken (check doet de controller).
 *   - Je kunt jezelf niet verwijderen, dat doet de controller ook.
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

/**
 * Record zoals hij in de DB (tabel public.invitations) staat.
 * Zie migratie 0008.
 */
export type InvitationRecord = {
  id: string;
  restaurant_id: string;
  email: string;
  role: Role;
  permissions: StoredPermissions | null;
  token: string;
  invited_by: string | null;
  expires_at: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

/**
 * Bouw een URL die naar onze eigen /auth/confirm-route wijst.
 *
 * WAAROM deze functie bestaat:
 * Supabase's `generateLink()` geeft een `action_link` terug die
 * verwijst naar Supabase's eigen /auth/v1/verify-endpoint. Dat
 * endpoint triggert de oude "implicit flow", de sessie komt dan
 * binnen als hash (#access_token=...) in de URL. Onze web-app
 * gebruikt `@supabase/ssr` die werkt met cookies, niet met hash-
 * tokens; daardoor ziet de accept-pagina geen sessie en faalt de
 * invite-afhandeling.
 *
 * Oplossing: we bouwen zelf een URL naar onze server-side route
 * `/auth/confirm`, die `verifyOtp({ token_hash, type })` aanroept
 * en de sessie netjes als cookie zet, identiek aan wat de
 * e-mail-templates voor nieuwe users doen.
 *
 * De origin (host) leiden we af uit `acceptBaseUrl` zodat er geen
 * aparte env-var voor de web-frontend nodig is.
 */
function buildConfirmUrl(
  acceptBaseUrl: string,
  redirectTo: string,
  hashedToken: string,
  type: 'invite' | 'magiclink',
): string {
  const origin = new URL(acceptBaseUrl).origin;
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: redirectTo,
  });
  return `${origin}/auth/confirm?${params.toString()}`;
}

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Haalt alle teamleden voor een restaurant op.
   * Roept de get_restaurant_members RPC aan (zie migratie 0007),
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
   *, dat doet de controller (kent current user). Hier checken we dat
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

  // ============================================================
  // Invites (uitnodigingen via e-mail)
  // ============================================================

  /**
   * Maak een nieuwe invite aan + stuur de uitnodigingsmail.
   *
   * Supabase heeft twee relevante API's:
   *   - auth.admin.inviteUserByEmail(), werkt alleen als user nog
   *     NIET bestaat. Supabase mailt automatisch.
   *   - auth.admin.generateLink({type:'magiclink'}), werkt voor
   *     bestaande users. Geeft link terug; we moeten 'm zelf mailen.
   *
   * Voor MVP:
   *   - Nieuwe user → inviteUserByEmail, Supabase stuurt de mail.
   *   - Bestaande user → magic link genereren + URL teruggeven zodat
   *     de owner 'm handmatig met de collega kan delen. (Later
   *     vervangen we dit door een eigen mail-provider zoals Resend.)
   */
  async createInvite(
    restaurantId: string,
    invitedByUserId: string,
    input: { email: string; role: Role; permissions?: Module[] | null },
    acceptBaseUrl: string,
  ): Promise<{
    invite: InvitationRecord;
    deliveredByEmail: boolean;
    manualLink?: string;
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Geldig e-mailadres vereist.');
    }

    // Voorkom duplicaten: als er al een pending invite staat voor deze
    // email + restaurant, gebruiken we die i.p.v. een nieuwe te maken.
    const { data: existing, error: existErr } = await this.supabase.client
      .from('invitations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existErr) throw existErr;

    let invite: InvitationRecord;
    if (existing) {
      invite = existing as InvitationRecord;
    } else {
      // Maak nieuwe invite. Token + expires worden door DB-defaults gezet.
      const { data: created, error: createErr } = await this.supabase.client
        .from('invitations')
        .insert({
          restaurant_id: restaurantId,
          email: normalizedEmail,
          role: input.role,
          permissions:
            input.permissions && input.permissions.length > 0
              ? { modules: input.permissions }
              : null,
          invited_by: invitedByUserId,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      invite = created as InvitationRecord;
    }

    // Bouw de accept-URL die we meesturen in de mail / link.
    const redirectTo = `${acceptBaseUrl}?inv=${invite.token}`;

    // Probeer eerst inviteUserByEmail. Als user al bestaat, valt terug
    // op generateLink + manualLink teruggeven.
    try {
      const { error: inviteErr } =
        await this.supabase.client.auth.admin.inviteUserByEmail(
          normalizedEmail,
          { redirectTo },
        );

      if (inviteErr) {
        // Check of dit de "user bestaat al"-fout is.
        const msg = (inviteErr.message || '').toLowerCase();
        const userExists =
          msg.includes('already been registered') ||
          msg.includes('already registered') ||
          msg.includes('user already exists');

        if (!userExists) throw inviteErr;

        // Bestaande user → genereer magic link, return 'm voor
        // handmatig delen (tot we een eigen mail-provider hebben).
        const { data: link, error: linkErr } =
          await this.supabase.client.auth.admin.generateLink({
            type: 'magiclink',
            email: normalizedEmail,
            options: { redirectTo },
          });

        if (linkErr) throw linkErr;

        // Bouw een link die door ONZE /auth/confirm-route loopt
        // (cookie-flow), niet door Supabase's oude hash-flow.
        // Zie buildConfirmUrl hierboven voor de reden.
        const hashedToken = link?.properties?.hashed_token;
        const manualLink = hashedToken
          ? buildConfirmUrl(acceptBaseUrl, redirectTo, hashedToken, 'magiclink')
          : redirectTo;

        return {
          invite,
          deliveredByEmail: false,
          manualLink,
        };
      }

      return { invite, deliveredByEmail: true };
    } catch (err) {
      this.logger.error(
        `Fout bij versturen invite naar ${normalizedEmail}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  /**
   * Genereer een verse magic-link voor een bestaande pending invite.
   * Gebruikt wanneer de oorspronkelijke mail niet aankwam (bv. door
   * Supabase's rate-limit) of als de owner de link handmatig wil
   * delen via WhatsApp o.i.d.
   *
   * Probeert eerst 'invite' type (voor nieuwe users), valt terug op
   * 'magiclink' (voor bestaande users). Geeft altijd een bruikbare
   * URL terug zolang de invite nog pending is.
   */
  async generateMagicLinkForInvite(
    restaurantId: string,
    inviteId: string,
    acceptBaseUrl: string,
  ): Promise<string> {
    const { data: inv, error: findErr } = await this.supabase.client
      .from('invitations')
      .select('*')
      .eq('id', inviteId)
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending')
      .maybeSingle();

    if (findErr) throw findErr;
    if (!inv) throw new NotFoundException('Openstaande invite niet gevonden.');

    const invite = inv as InvitationRecord;
    const redirectTo = `${acceptBaseUrl}?inv=${invite.token}`;

    // Probeer eerst 'magiclink' (bestaande user). Faalt die: 'invite' (nieuwe user).
    const tryTypes: Array<'magiclink' | 'invite'> = ['magiclink', 'invite'];
    for (const type of tryTypes) {
      const { data, error } = await this.supabase.client.auth.admin.generateLink({
        type,
        email: invite.email,
        options: { redirectTo },
      });
      // We gebruiken hashed_token + onze eigen /auth/confirm-route
      // i.p.v. Supabase's action_link, zie buildConfirmUrl boven.
      const hashedToken = data?.properties?.hashed_token;
      if (!error && hashedToken) {
        return buildConfirmUrl(acceptBaseUrl, redirectTo, hashedToken, type);
      }
    }

    throw new BadRequestException(
      'Kon geen magic link genereren. Controleer de Supabase redirect URLs.',
    );
  }

  /**
   * Lijst van openstaande (pending) invites voor een restaurant,
   * om op de team-pagina te laten zien onder "Uitgenodigd, nog niet
   * geaccepteerd".
   */
  async listInvites(restaurantId: string): Promise<InvitationRecord[]> {
    const { data, error } = await this.supabase.client
      .from('invitations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as InvitationRecord[];
  }

  /**
   * Intrekken van een nog niet-geaccepteerde invite.
   */
  async revokeInvite(restaurantId: string, inviteId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new NotFoundException(
        'Invite niet gevonden of al geaccepteerd/ingetrokken.',
      );
    }
  }

  /**
   * Accepteer een invite: validate token, check expires, koppel user
   * aan restaurant, markeer invite als accepted.
   *
   * acceptingUserId komt uit de JWT van de ingelogde user (die net op
   * de magic-link heeft geklikt). acceptingEmail checken we tegen de
   * email in de invitation om te voorkomen dat iemand met z'n eigen
   * token een invite accepteert die niet voor hem bedoeld was.
   */
  async acceptInvite(
    token: string,
    acceptingUserId: string,
    acceptingEmail: string | null,
  ): Promise<{ restaurantId: string; role: Role }> {
    // Haal invite op.
    const { data: invite, error: findErr } = await this.supabase.client
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!invite) throw new NotFoundException('Uitnodiging niet gevonden.');

    const inv = invite as InvitationRecord;

    if (inv.status !== 'pending') {
      throw new BadRequestException(
        inv.status === 'accepted'
          ? 'Deze uitnodiging is al geaccepteerd.'
          : 'Deze uitnodiging is ingetrokken of verlopen.',
      );
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Deze uitnodiging is verlopen.');
    }

    // Check: e-mail van de ingelogde user moet matchen met invite's email.
    if (
      !acceptingEmail ||
      acceptingEmail.toLowerCase() !== inv.email.toLowerCase()
    ) {
      throw new ForbiddenException(
        'Deze uitnodiging is voor een ander e-mailadres.',
      );
    }

    // Zorg dat er een public.users-rij bestaat voor deze user
    // (spiegel van auth.users). Idempotent.
    await this.supabase.client
      .from('users')
      .upsert({ id: acceptingUserId }, { onConflict: 'id' });

    // Bestaat er al een koppeling? Dan mag een lopende invite die NIET
    // stil downgraden (bv. een owner die per ongeluk een staff-invite
    // accepteert zou anders z'n owner-rol verliezen → restaurant zonder owner).
    const { data: existingLink } = await this.supabase.client
      .from('restaurant_users')
      .select('role')
      .eq('restaurant_id', inv.restaurant_id)
      .eq('user_id', acceptingUserId)
      .maybeSingle();
    const roleRank = (r: string | null | undefined): number =>
      r === 'owner' ? 3 : r === 'manager' ? 2 : r === 'staff' ? 1 : 0;
    const wouldDowngrade =
      !!existingLink &&
      roleRank(existingLink.role as string) > roleRank(inv.role);

    // Maak/overwrite de restaurant_users-koppeling met rol + permissies.
    // Bij een downgrade laten we de bestaande (hogere) rol staan.
    if (!wouldDowngrade) {
      const { error: linkErr } = await this.supabase.client
        .from('restaurant_users')
        .upsert(
          {
            restaurant_id: inv.restaurant_id,
            user_id: acceptingUserId,
            role: inv.role,
            permissions: inv.permissions,
          },
          { onConflict: 'restaurant_id,user_id' },
        );

      if (linkErr) throw linkErr;
    }

    // Markeer invite als accepted (zodat-ie niet nog eens gebruikt kan).
    const { error: updateErr } = await this.supabase.client
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: acceptingUserId,
      })
      .eq('id', inv.id);

    if (updateErr) throw updateErr;

    return { restaurantId: inv.restaurant_id, role: inv.role };
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
