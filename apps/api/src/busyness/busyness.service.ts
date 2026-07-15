import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Service-role client: busyness_snapshots heeft RLS aan zonder policies,
// dus alleen de service-role mag hier lezen/schrijven. De tenant-isolatie
// op de handmatige endpoint komt van de RestaurantAccessGuard.
import { SupabaseService } from '../supabase/supabase.service';
import { OutscraperClient } from './outscraper.client';
import { parsePopularTimes } from './outscraper.parser';

export interface RefreshResult {
  restaurantId: string;
  placeId: string | null;
  hasPattern: boolean;
  livePct: number | null;
  skipped?: string; // reden als er niets is weggeschreven
}

// Weekdag-mapping voor Intl (en-US short) → onze index 0=ma..6=zo.
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

@Injectable()
export class BusynessService {
  private readonly logger = new Logger(BusynessService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly outscraper: OutscraperClient,
  ) {}

  // "Nu" in Europe/Amsterdam als {weekday 0-6, hour 0-23}. De live-meting
  // van Google geeft geen dag mee, dus die leiden we hier af.
  private nowAmsterdam(): { weekday: number; hour: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    let hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    if (!Number.isFinite(hour) || hour === 24) hour = 0; // middernacht kan '24' geven
    return { weekday: WEEKDAY_INDEX[wd] ?? 0, hour };
  }

  /**
   * Haalt de drukte voor één restaurant op bij Outscraper en schrijft een
   * snapshot weg. Overslaan (geen fout) als er geen place_id of geen
   * Outscraper-resultaat is.
   */
  async refreshRestaurant(restaurantId: string): Promise<RefreshResult> {
    const { data: rest, error } = await this.supabase.client
      .from('restaurants')
      .select('id, google_place_id')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!rest) throw new NotFoundException('Restaurant niet gevonden.');

    const placeId = (rest.google_place_id as string | null) ?? null;
    if (!placeId) {
      return {
        restaurantId,
        placeId: null,
        hasPattern: false,
        livePct: null,
        skipped: 'geen google_place_id',
      };
    }

    const place = await this.outscraper.fetchPlace(placeId);
    if (!place) {
      return {
        restaurantId,
        placeId,
        hasPattern: false,
        livePct: null,
        skipped: 'geen Outscraper-resultaat',
      };
    }

    const { pattern, livePct, liveHour } = parsePopularTimes(
      place.popular_times,
    );
    const now = this.nowAmsterdam();
    const hasLive = livePct !== null;

    const { error: insErr } = await this.supabase.client
      .from('busyness_snapshots')
      .insert({
        restaurant_id: restaurantId,
        place_id: placeId,
        source: 'outscraper',
        pattern, // 7x24 verwacht, of null bij kleine zaak
        live_pct: livePct,
        // live_hour/weekday alleen zetten als er live-drukte is (constraint
        // laat null toe). Voorkeur voor Google's opgegeven uur, anders "nu".
        live_hour: hasLive ? (liveHour ?? now.hour) : null,
        live_weekday: hasLive ? now.weekday : null,
        raw: place.raw,
      });
    if (insErr) throw new InternalServerErrorException(insErr.message);

    this.logger.log(
      `busyness ${restaurantId}: pattern=${pattern ? 'ja' : 'nee'} live=${livePct ?? '-'}`,
    );
    return { restaurantId, placeId, hasPattern: pattern !== null, livePct };
  }

  /**
   * De meest recente snapshot MET een weekpatroon (verwacht) voor dit
   * restaurant, plus de laatste live-meting. Gebruikt door het dashboard
   * (busyness.ts) als bron voor de verwachte lijn; geen snapshot → null
   * (frontend valt dan terug op de seed).
   */
  async getLatest(restaurantId: string): Promise<{
    pattern: number[][] | null;
    livePct: number | null;
    liveHour: number | null;
    liveWeekday: number | null;
    capturedAt: string | null;
  }> {
    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('pattern, live_pct, live_hour, live_weekday, captured_at')
      .eq('restaurant_id', restaurantId)
      .not('pattern', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      return {
        pattern: null,
        livePct: null,
        liveHour: null,
        liveWeekday: null,
        capturedAt: null,
      };
    }
    return {
      pattern: (data.pattern as number[][] | null) ?? null,
      livePct: data.live_pct ?? null,
      liveHour: data.live_hour ?? null,
      liveWeekday: data.live_weekday ?? null,
      capturedAt: data.captured_at ?? null,
    };
  }

  /**
   * Ververst alle restaurants met een google_place_id. Eén kapotte plek
   * blokkeert de rest niet (per zaak gevangen + gelogd).
   */
  async refreshAll(): Promise<{
    total: number;
    refreshed: number;
    results: RefreshResult[];
  }> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('id')
      .not('google_place_id', 'is', null);
    if (error) throw new InternalServerErrorException(error.message);

    const ids = (data ?? []).map((r) => r.id as string);
    const results: RefreshResult[] = [];
    for (const id of ids) {
      try {
        results.push(await this.refreshRestaurant(id));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`busyness-refresh faalde voor ${id}: ${msg}`);
        results.push({
          restaurantId: id,
          placeId: null,
          hasPattern: false,
          livePct: null,
          skipped: `fout: ${msg}`,
        });
      }
    }
    const refreshed = results.filter(
      (r) => r.hasPattern || r.livePct !== null,
    ).length;
    this.logger.log(
      `busyness-refresh klaar: ${refreshed}/${ids.length} met data.`,
    );
    return { total: ids.length, refreshed, results };
  }
}
