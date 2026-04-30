import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AnonymizationService } from '../anonymization/anonymization.service';

// ============================================================
// AccountDeletionService — AVG art. 17 (right to be forgotten)
// ============================================================
// Verwijdert een gebruiker permanent uit het systeem, inclusief
// alle restaurants waarin diegene de eigenaar is en alle data
// die daaraan vasthangt (gasten, reserveringen, menu, campagnes,
// reviews, chat, audit-log).
//
// Volgorde — bewust eerst anonymiseren, dan deleten:
//   1. Confirmation-check ("VERWIJDER" letterlijk)
//   2. Verzamel alle restaurants waar user 'owner' is
//   3. Per restaurant: blokkeer als er andere actieve members
//      bestaan (manager/staff). Eigenaar moet eerst zelf zijn
//      team verwijderen of een andere eigenaar aanwijzen.
//   4. Vóór delete: voor elk restaurant alle 'afgerond'-campagnes
//      door AnonymizationService laten benchmarken — laatste kans
//      om leerwaarde te bewaren voordat de FK-cascade alles wist.
//   5. Delete restaurants → cascade alle business-data
//   6. Delete auth.users via Supabase Admin API → cascade
//      public.users + restaurant_users
//   7. Insert account_deletions-bewijsrij (geen PII, alleen
//      tellers + datum) voor AVG art. 30 verantwoordingsplicht
//
// Falen onderweg:
//   - Stappen 1-3 falen vóór er iets is gewist (BadRequest/Conflict).
//   - Stap 4 (anonymiseren) is fail-soft, hindert delete niet.
//   - Stap 5 faalt → 500, partiële cleanup mogelijk maar restaurant-
//     cascade is atomic per delete (alle FK-cascades gaan in dezelfde
//     transactie als de restaurants-delete).
//   - Stap 6 (auth.users) faalt zeer zelden (alleen Supabase-down);
//     in dat geval staat user nog wel in auth maar zonder restaurant.
//     Frontend toont dan een nette foutmelding.
// ============================================================

const REQUIRED_CONFIRMATION = 'VERWIJDER';

export type AccountDeletionResult = {
  deleted_user_id: string;
  restaurants_deleted: number;
  campaigns_anonymized: number;
};

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly anonymization: AnonymizationService,
  ) {}

  async deleteAccount(
    userId: string,
    confirmation: string,
  ): Promise<AccountDeletionResult> {
    if (confirmation !== REQUIRED_CONFIRMATION) {
      throw new BadRequestException(
        `Bevestiging ontbreekt of is fout. Type letterlijk '${REQUIRED_CONFIRMATION}' om door te gaan.`,
      );
    }

    // Stap 2: alle owner-memberships ophalen.
    const { data: memberships, error: memErr } = await this.supabase.client
      .from('restaurant_users')
      .select('restaurant_id, role')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (memErr) {
      throw new InternalServerErrorException(
        `Memberships ophalen faalde: ${memErr.message}`,
      );
    }

    const ownerRestaurantIds = (memberships ?? []).map(
      (r) => r.restaurant_id as string,
    );

    // Stap 3: per restaurant checken op andere actieve members.
    // Eigenaar mag niet wegrennen met team's data — eerst manager/
    // staff verwijderen of overdracht regelen (later P3).
    if (ownerRestaurantIds.length > 0) {
      const { data: otherMembers, error: omErr } = await this.supabase.client
        .from('restaurant_users')
        .select('restaurant_id, user_id')
        .in('restaurant_id', ownerRestaurantIds)
        .neq('user_id', userId);

      if (omErr) {
        throw new InternalServerErrorException(
          `Team-check faalde: ${omErr.message}`,
        );
      }

      if (otherMembers && otherMembers.length > 0) {
        const blocked = new Set(
          otherMembers.map((r) => r.restaurant_id as string),
        );
        throw new ConflictException(
          `Je restaurant heeft nog ${otherMembers.length} ander${
            otherMembers.length === 1 ? '' : 'e'
          } teamlid${
            otherMembers.length === 1 ? '' : 'len'
          }. Verwijder die eerst, of neem contact op met support voor overdracht. (${
            blocked.size
          } restaurant${blocked.size === 1 ? '' : 's'} geraakt)`,
        );
      }
    }

    // Stap 4: laatste-kans-anonymisering. Vangt eventuele
    // afgeronde campagnes op die om wat voor reden niet via de
    // status-hook in CampaignsService gebenchmarkt zijn (bv.
    // door eerdere fouten in de hook). Fail-soft.
    let campaignsAnonymized = 0;
    for (const rid of ownerRestaurantIds) {
      campaignsAnonymized +=
        await this.anonymization.benchmarkAllCompletedFor(rid);
    }

    // Stap 5: restaurants verwijderen → cascade business-data.
    if (ownerRestaurantIds.length > 0) {
      const { error: delRestErr } = await this.supabase.client
        .from('restaurants')
        .delete()
        .in('id', ownerRestaurantIds);

      if (delRestErr) {
        throw new InternalServerErrorException(
          `Restaurants verwijderen faalde: ${delRestErr.message}`,
        );
      }
    }

    // Stap 6: auth.users verwijderen via Supabase Admin API.
    // Cascade op auth.users → public.users → restaurant_users
    // (laatste resterende non-owner memberships voor andere
    // restaurants verdwijnen ook netjes).
    const { error: authErr } = await this.supabase.client.auth.admin.deleteUser(
      userId,
    );
    if (authErr) {
      // Restaurants zijn al weg op dit punt — user staat dan in
      // weeskind-staat in auth.users zonder profile. Loggen + 500
      // zodat support kan ingrijpen.
      this.logger.error(
        `auth.users delete faalde voor user ${userId} ná restaurant-delete: ${authErr.message}`,
      );
      throw new InternalServerErrorException(
        'Account gedeeltelijk verwijderd; neem contact op met support om de laatste stap af te ronden.',
      );
    }

    // Stap 7: bewijsrij in account_deletions (zonder PII).
    const { error: proofErr } = await this.supabase.client
      .from('account_deletions')
      .insert({
        restaurants_deleted_count: ownerRestaurantIds.length,
        campaigns_anonymized_count: campaignsAnonymized,
        reason: 'self_service',
      });
    if (proofErr) {
      // Geen show-stopper — primaire delete is gelukt; alleen
      // de bewijs-rij ontbreekt. Loggen voor handmatige correctie.
      this.logger.warn(
        `account_deletions insert faalde (delete zelf wel succesvol): ${proofErr.message}`,
      );
    }

    return {
      deleted_user_id: userId,
      restaurants_deleted: ownerRestaurantIds.length,
      campaigns_anonymized: campaignsAnonymized,
    };
  }
}
