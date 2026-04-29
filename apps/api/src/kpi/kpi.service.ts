import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type Kpis = {
  today_pct: number | null;
  weekday_avg_pct: number | null;
  month_avg_pct: number | null;
  month_guests: number;
  month_revenue_cents: number;
  pending_suggestions: number;
  // Filly-attributie deze maand. Gebaseerd op
  // reservations.via_campaign_id (sinds migratie 0022). Geeft 0 terug
  // als nog geen enkele reservering aan een campagne is gekoppeld —
  // niet null, zodat de UI een "0 via Filly" kan tonen.
  month_filly_reservations: number;
  month_filly_guests: number;
  // Aandeel als percentage van totaal aantal gasten (0-100). Null als
  // er nog geen totaal-cijfer is om tegen af te zetten.
  month_filly_share_pct: number | null;
  // Schatting extra omzet via Filly. Berekend als
  // sum(reserveringen_via_filly.party_size) × gem-besteding-per-gast.
  // Gem-besteding leiden we af uit de echte maand-cijfers
  // (revenue / guests). Bij geen maand-data: 0.
  month_filly_revenue_cents: number;
};

// Aggregaat per campagne — voor de rapportages-pagina ROI-sectie.
export type CampaignAttribution = {
  campaign_id: string;
  campaign_name: string;
  campaign_type: 'mail' | 'social' | 'whatsapp';
  reservations: number;
  guests: number;
  estimated_revenue_cents: number;
};

// Per maand-bucket voor de 6-maanden ROI-grafiek.
export type FillyRoiMonth = {
  // YYYY-MM bv. "2026-04"
  month: string;
  reservations: number;
  guests: number;
  estimated_revenue_cents: number;
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

    // Parallel ophalen: bezetting + suggesties + Filly-attributie.
    // Drie queries i.p.v. één join zodat elk stuk z'n eigen index
    // gebruikt en we kort blijven (~50-100ms totaal).
    const [
      { data: occDays, error: occErr },
      { data: suggestions, error: sugErr },
      { data: fillyRes, error: fillyErr },
    ] = await Promise.all([
      this.supabase.client
        .from('occupancy_days')
        .select(
          'date, occupancy_pct, estimated_guests, estimated_revenue_cents',
        )
        .eq('restaurant_id', restaurantId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      this.supabase.client
        .from('ai_suggestions')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending'),
      this.supabase.client
        .from('reservations')
        .select('id, party_size')
        .eq('restaurant_id', restaurantId)
        .gte('reservation_date', monthStart)
        .lte('reservation_date', monthEnd)
        .not('via_campaign_id', 'is', null),
    ]);

    if (occErr) throw new InternalServerErrorException(occErr.message);
    if (sugErr) throw new InternalServerErrorException(sugErr.message);
    if (fillyErr) throw new InternalServerErrorException(fillyErr.message);

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

    // Filly-attributie deze maand
    const fillyReservationsList = fillyRes ?? [];
    const month_filly_reservations = fillyReservationsList.length;
    const month_filly_guests = fillyReservationsList.reduce(
      (s, r) => s + (Number(r.party_size) || 0),
      0,
    );
    const month_filly_share_pct =
      month_guests > 0
        ? Math.round((month_filly_guests / month_guests) * 100)
        : null;
    // Gem-besteding per gast schatten uit de maand-totalen. Bij geen
    // maand-data (nieuwe klant) → 0 zodat we niet met 0÷0 hangen.
    const avgSpendCents =
      month_guests > 0 ? Math.round(month_revenue_cents / month_guests) : 0;
    const month_filly_revenue_cents = month_filly_guests * avgSpendCents;

    const weekday_avg_pct = 68; // TODO: uit 6-maanden historie

    return {
      today_pct: today_pct !== null ? Math.round(Number(today_pct)) : null,
      weekday_avg_pct,
      month_avg_pct,
      month_guests,
      month_revenue_cents,
      pending_suggestions: suggestions?.length ?? 0,
      month_filly_reservations,
      month_filly_guests,
      month_filly_share_pct,
      month_filly_revenue_cents,
    };
  }

  // Per-campagne attributie voor de huidige maand. Wordt gebruikt op
  // de rapportages-pagina (ROI per kanaal). Aggregeert over alle
  // reservations met via_campaign_id = X gegroupeerd per campagne.
  async getCampaignAttributionThisMonth(
    restaurantId: string,
  ): Promise<CampaignAttribution[]> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    // Eén query: reservations met campaign-info erbij. We doen de
    // group-by client-side want Supabase's PostgREST heeft geen
    // simpele group-by-aggregate-API; voor kleine reservation-counts
    // (~hundreds per maand) is dat verwaarloosbaar.
    const { data, error } = await this.supabase.client
      .from('reservations')
      .select(
        `id, party_size, via_campaign_id,
         campaign:campaigns!reservations_via_campaign_id_fkey(id, name, type)`,
      )
      .eq('restaurant_id', restaurantId)
      .gte('reservation_date', monthStart)
      .lte('reservation_date', monthEnd)
      .not('via_campaign_id', 'is', null);

    if (error) throw new InternalServerErrorException(error.message);

    // Voor de revenue-schatting: zelfde gem-besteding-per-gast als bij
    // getKpis. Eén extra query voor de maand-totalen.
    const { data: monthTotals } = await this.supabase.client
      .from('occupancy_days')
      .select('estimated_guests, estimated_revenue_cents')
      .eq('restaurant_id', restaurantId)
      .gte('date', monthStart)
      .lte('date', monthEnd);

    const totalGuests = (monthTotals ?? []).reduce(
      (s, d) => s + (d.estimated_guests ?? 0),
      0,
    );
    const totalRev = (monthTotals ?? []).reduce(
      (s, d) => s + (d.estimated_revenue_cents ?? 0),
      0,
    );
    const avgSpend = totalGuests > 0 ? Math.round(totalRev / totalGuests) : 0;

    const map = new Map<string, CampaignAttribution>();
    for (const row of data ?? []) {
      // Supabase returnt embedded relations als array of object;
      // bij `to-one` is het een object — we narrowen het naar
      // het eerste element als 't toevallig array is.
      const camp = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;
      if (!camp) continue;
      const existing = map.get(camp.id) ?? {
        campaign_id: camp.id,
        campaign_name: camp.name,
        campaign_type: camp.type as 'mail' | 'social' | 'whatsapp',
        reservations: 0,
        guests: 0,
        estimated_revenue_cents: 0,
      };
      existing.reservations += 1;
      existing.guests += Number(row.party_size) || 0;
      existing.estimated_revenue_cents = existing.guests * avgSpend;
      map.set(camp.id, existing);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.estimated_revenue_cents - a.estimated_revenue_cents,
    );
  }

  // 6 maanden Filly-ROI voor de bar-grafiek op rapportages.
  async getFillyRoi6Months(restaurantId: string): Promise<FillyRoiMonth[]> {
    const now = new Date();
    // Begin van 6 maanden geleden (dus 5 maanden terug + huidige maand
    // = 6 buckets).
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      .toISOString()
      .slice(0, 10);

    const { data: reservations, error } = await this.supabase.client
      .from('reservations')
      .select('reservation_date, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('reservation_date', start)
      .not('via_campaign_id', 'is', null);

    if (error) throw new InternalServerErrorException(error.message);

    // Maand-totalen voor avg-spend
    const { data: occ } = await this.supabase.client
      .from('occupancy_days')
      .select('date, estimated_guests, estimated_revenue_cents')
      .eq('restaurant_id', restaurantId)
      .gte('date', start);

    const occByMonth = new Map<string, { guests: number; rev: number }>();
    for (const d of occ ?? []) {
      const key = d.date.slice(0, 7);
      const prev = occByMonth.get(key) ?? { guests: 0, rev: 0 };
      prev.guests += d.estimated_guests ?? 0;
      prev.rev += d.estimated_revenue_cents ?? 0;
      occByMonth.set(key, prev);
    }

    // Lege buckets voor alle 6 maanden zodat de grafiek altijd 6 kolommen
    // heeft, ook als sommige maanden geen attributie hebben.
    const buckets = new Map<string, FillyRoiMonth>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, {
        month: key,
        reservations: 0,
        guests: 0,
        estimated_revenue_cents: 0,
      });
    }

    for (const r of reservations ?? []) {
      const key = (r.reservation_date as string).slice(0, 7);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.reservations += 1;
      bucket.guests += Number(r.party_size) || 0;
    }

    // Revenue per bucket invullen op basis van avg-spend van die maand.
    for (const bucket of buckets.values()) {
      const totals = occByMonth.get(bucket.month);
      const avgSpend =
        totals && totals.guests > 0 ? Math.round(totals.rev / totals.guests) : 0;
      bucket.estimated_revenue_cents = bucket.guests * avgSpend;
    }

    return Array.from(buckets.values());
  }
}
