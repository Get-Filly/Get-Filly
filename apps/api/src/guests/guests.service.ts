import { Injectable, InternalServerErrorException } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';

export type Guest = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  visit_count: number;
  last_visit_at: string | null;
  tags: string[];
  mail_opt_in: boolean;
  source: string | null;
  average_spend_cents: number | null;
  lifetime_value_cents: number | null;
  preferences: { allergies?: string[]; dietary?: string[] } | null;
  notes: string | null;
  // Filly-attributie (sinds migratie 0022). Wordt automatisch gezet
  // door ReservationsService.setAttribution zodra een reservering
  // van deze gast aan een campagne wordt gekoppeld én de gast nog
  // geen attributie had.
  acquired_via_campaign_id: string | null;
};

@Injectable()
export class GuestsService {
  constructor(private readonly supabase: RequestSupabaseService) {}

  async findAll(restaurantId: string): Promise<Guest[]> {
    const { data, error } = await this.supabase.client
      .from('guests')
      .select(
        'id, first_name, last_name, email, phone, birthday, visit_count, last_visit_at, tags, mail_opt_in, source, average_spend_cents, lifetime_value_cents, preferences, notes, acquired_via_campaign_id',
      )
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null)
      .order('last_visit_at', { ascending: false, nullsFirst: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Guest[];
  }
}
