import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
};

@Injectable()
export class GuestsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(restaurantId: string): Promise<Guest[]> {
    const { data, error } = await this.supabase.client
      .from('guests')
      .select(
        'id, first_name, last_name, email, phone, birthday, visit_count, last_visit_at, tags, mail_opt_in, source, average_spend_cents, lifetime_value_cents, preferences, notes',
      )
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null)
      .order('last_visit_at', { ascending: false, nullsFirst: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as Guest[];
  }
}
