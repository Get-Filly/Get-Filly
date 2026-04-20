import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number | null;
  is_signature: boolean;
  is_seasonal: boolean;
  season: string | null;
  is_available: boolean;
  dietary_tags: string[];
};

@Injectable()
export class MenuService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(restaurantId: string): Promise<MenuItem[]> {
    const { data, error } = await this.supabase.client
      .from('menu_items')
      .select(
        'id, name, description, category, price_cents, is_signature, is_seasonal, season, is_available, dietary_tags',
      )
      .eq('restaurant_id', restaurantId)
      .order('category', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as MenuItem[];
  }
}
