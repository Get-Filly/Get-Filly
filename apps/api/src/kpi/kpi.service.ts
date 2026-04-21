import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type Kpis = {
  today_pct: number | null;
  last_week_pct: number | null; // bezetting dezelfde weekdag vorige week
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

    // Bezetting 7 dagen geleden (dezelfde weekdag vorige week)
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().slice(0, 10);

    const { data: lastWeekData } = await this.supabase.client
      .from('occupancy_days')
      .select('occupancy_pct')
      .eq('restaurant_id', restaurantId)
      .eq('date', lastWeekStr)
      .maybeSingle();

    const last_week_pct =
      lastWeekData?.occupancy_pct !== undefined &&
      lastWeekData?.occupancy_pct !== null
        ? Math.round(Number(lastWeekData.occupancy_pct))
        : null;

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

    return {
      today_pct: today_pct !== null ? Math.round(Number(today_pct)) : null,
      last_week_pct,
      month_avg_pct,
      month_guests,
      month_revenue_cents,
      pending_suggestions: suggestions?.length ?? 0,
    };
  }
}
