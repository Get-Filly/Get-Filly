import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const DEMO_RESTAURANT = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class RestaurantService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMe() {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('*')
      .eq('id', DEMO_RESTAURANT)
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async updateMe(updates: Record<string, unknown>) {
    // Verwijder velden die niet geüpdatet mogen worden
    const { id, created_at, ...safe } = updates as Record<string, unknown>;
    void id;
    void created_at;

    const { data, error } = await this.supabase.client
      .from('restaurants')
      .update({ ...safe, updated_at: new Date().toISOString() })
      .eq('id', DEMO_RESTAURANT)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
