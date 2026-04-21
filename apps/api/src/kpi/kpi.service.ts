import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type Kpis = {
  today_pct: number | null;
  weekday_avg_pct: number | null;
  month_avg_pct: number | null;
  month_guests: number;
  month_revenue_cents: number;
  pending_suggestions: number;
};

@Injectable()
export class KpiService {
  constructor(private readonly supabase: SupabaseService) {}

  async getKpis(restaurantId: string): Promise<Kpis> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const { data: occDays, error: occErr } = await this.supabase.client
      .from('occupancy_days')
      .select('date, occupancy_pct, estimated_guests, estimated_revenue_cents')
      .eq('restaurant_id', restaurantId)
      .gte('date', monthStart)
      .lte('date', monthEnd);

    if (occErr) throw new InternalServerErrorException(occErr.message);

    const { data: suggestions, error: sugErr } = await this.supabase.client
      .from('ai_suggestions')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending');

    if (sugErr) throw new InternalServerErrorException(sugErr.message);

    const days = occDays ?? [];
    const todayEntry = days.find((d) => d.date === todayStr);
    const today_pct = todayEntry?.occupancy_pct ?? null;

    const month_avg_pct = days.length
      ? Math.round(
          days.reduce((s, d) => s + Number(d.occupancy_pct ?? 0), 0) /
            days.length,
        )
      : null;

    const month_guests = days.reduce(
      (s, d) => s + (d.estimated_guests ?? 0),
      0,
    );
    const month_revenue_cents = days.reduce(
      (s, d) => s + (d.estimated_revenue_cents ?? 0),
      0,
    );

    const weekday_avg_pct = 68; // TODO Stap 8E: uit 6-maanden historie

    return {
      today_pct: today_pct !== null ? Math.round(Number(today_pct)) : null,
      weekday_avg_pct,
      month_avg_pct,
      month_guests,
      month_revenue_cents,
      pending_suggestions: suggestions?.length ?? 0,
    };
  }
}
