import { Injectable, InternalServerErrorException } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';

export type OccupancyDay = {
  date: string;
  occupancy_pct: number;
  estimated_guests: number;
  estimated_revenue_cents: number;
};

@Injectable()
export class OccupancyService {
  constructor(private readonly supabase: RequestSupabaseService) {}

  async getMonth(
    restaurantId: string,
    year: number,
    month: number,
  ): Promise<OccupancyDay[]> {
    const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const { data, error } = await this.supabase.client
      .from('occupancy_days')
      .select('date, occupancy_pct, estimated_guests, estimated_revenue_cents')
      .eq('restaurant_id', restaurantId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);

    return (data ?? []).map((d) => ({
      date: d.date,
      occupancy_pct: Math.round(Number(d.occupancy_pct ?? 0)),
      estimated_guests: d.estimated_guests ?? 0,
      estimated_revenue_cents: d.estimated_revenue_cents ?? 0,
    }));
  }
}
