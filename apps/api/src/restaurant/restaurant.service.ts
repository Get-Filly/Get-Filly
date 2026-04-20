import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class RestaurantService {
  constructor(private readonly supabase: SupabaseService) {}

  async getById(restaurantId: string) {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async update(restaurantId: string, updates: Record<string, unknown>) {
    const { id, created_at, ...safe } = updates as Record<string, unknown>;
    void id;
    void created_at;

    const { data, error } = await this.supabase.client
      .from('restaurants')
      .update({ ...safe, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
