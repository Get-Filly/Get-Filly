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
import {
  parsePopularTimes,
  parseWorkingHours,
  type OpeningHours,
} from './outscraper.parser';

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
      .select('id, busyness_place_id, google_place_id')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!rest) throw new NotFoundException('Restaurant niet gevonden.');

    // Drukte-bron: eigen veld eerst, anders terugval op de GBP-place_id.
    const placeId =
      (rest.busyness_place_id as string | null) ??
      (rest.google_place_id as string | null) ??
      null;
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
    const openingHours = parseWorkingHours(place.working_hours);
    const now = this.nowAmsterdam();
    const hasLive = livePct !== null;

    const { error: insErr } = await this.supabase.client
      .from('busyness_snapshots')
      .insert({
        restaurant_id: restaurantId,
        place_id: placeId,
        source: 'outscraper',
        pattern, // 7x24 verwacht, of null bij kleine zaak
        opening_hours: openingHours, // uit working_hours, voor de grafiek-x-as
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
    openingHours: OpeningHours | null;
    livePct: number | null;
    liveHour: number | null;
    liveWeekday: number | null;
    capturedAt: string | null;
  }> {
    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select(
        'pattern, opening_hours, live_pct, live_hour, live_weekday, captured_at',
      )
      .eq('restaurant_id', restaurantId)
      .not('pattern', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      return {
        pattern: null,
        openingHours: null,
        livePct: null,
        liveHour: null,
        liveWeekday: null,
        capturedAt: null,
      };
    }
    return {
      pattern: (data.pattern as number[][] | null) ?? null,
      openingHours: (data.opening_hours as OpeningHours | null) ?? null,
      livePct: data.live_pct ?? null,
      liveHour: data.live_hour ?? null,
      liveWeekday: data.live_weekday ?? null,
      capturedAt: data.captured_at ?? null,
    };
  }

  // Is de zaak NU open volgens deze openingstijden? Uur-precisie is genoeg
  // voor de "moeten we live meten"-beslissing. close "00:00"/na middernacht
  // → tot eind van de dag.
  private isOpenNow(
    oh: OpeningHours | null,
    now: { weekday: number; hour: number },
  ): boolean {
    if (!oh) return false;
    const key = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][now.weekday];
    const day = oh[key];
    if (!day || !day.open || !day.close) return false;
    const openH = parseInt(day.open.slice(0, 2), 10);
    let closeH = parseInt(day.close.slice(0, 2), 10);
    if (closeH <= openH) closeH = 24; // 00:00 of over middernacht
    return now.hour >= openH && now.hour < closeH;
  }

  // Amsterdam-kalenderdatum (YYYY-MM-DD) van een tijdstip.
  private amsterdamDate(d: Date): string {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = p.find((x) => x.type === 'year')?.value ?? '1970';
    const m = p.find((x) => x.type === 'month')?.value ?? '01';
    const day = p.find((x) => x.type === 'day')?.value ?? '01';
    return `${y}-${m}-${day}`;
  }

  private median(nums: number[]): number {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  /**
   * Echte werkelijk-drukte per dag uit de live-metingen, voor een
   * datumbereik (de zichtbare weken). Per (datum, uur) de MEDIAAN van de
   * live_pct-waarden (tegen uitschieters). Retourneert per Amsterdam-datum
   * een gesorteerde lijst [uur, pct]. Alleen dagen/uren met een meting.
   */
  async getActualByDate(
    restaurantId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Record<string, [number, number][]>> {
    // UTC-marge van een dag aan beide kanten (Amsterdam-datum ≠ UTC-datum).
    const lower = new Date(`${fromIso}T00:00:00Z`);
    lower.setUTCDate(lower.getUTCDate() - 1);
    const upper = new Date(`${toIso}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 2);

    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('captured_at, live_pct, live_hour')
      .eq('restaurant_id', restaurantId)
      .not('live_pct', 'is', null)
      .gte('captured_at', lower.toISOString())
      .lte('captured_at', upper.toISOString())
      .order('captured_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);

    // bucket[datum][uur] = [pct, ...]
    const bucket: Record<string, Record<number, number[]>> = {};
    for (const row of data ?? []) {
      const when = new Date(row.captured_at as string);
      const date = this.amsterdamDate(when);
      if (date < fromIso || date > toIso) continue;
      const hour =
        row.live_hour ??
        parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Amsterdam',
            hour: '2-digit',
            hour12: false,
          }).format(when),
          10,
        );
      if (hour == null || hour < 0 || hour > 23) continue;
      (bucket[date] ??= {})[hour] ??= [];
      bucket[date][hour].push(row.live_pct as number);
    }

    const out: Record<string, [number, number][]> = {};
    for (const [date, hours] of Object.entries(bucket)) {
      out[date] = Object.entries(hours)
        .map(([h, pcts]) => [Number(h), this.median(pcts)] as [number, number])
        .sort((a, b) => a[0] - b[0]);
    }
    return out;
  }

  /**
   * Uurlijkse live-meting: belt per restaurant ALLEEN als het nu open is
   * (bespaart calls buiten openingstijden). Elke call haalt pattern + live
   * op, dus dit ververst het verwachte patroon meteen mee. Onbekende
   * openingstijden (nog nooit gepulld) → tóch bellen om te bootstrappen.
   */
  async refreshLive(): Promise<{
    total: number;
    called: number;
    skipped: number;
    results: RefreshResult[];
  }> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('id, opening_hours')
      .or('busyness_place_id.not.is.null,google_place_id.not.is.null');
    if (error) throw new InternalServerErrorException(error.message);

    const now = this.nowAmsterdam();
    const results: RefreshResult[] = [];
    let called = 0;
    let skipped = 0;

    for (const r of data ?? []) {
      const id = r.id as string;
      const owner = (r.opening_hours as OpeningHours | null) ?? null;
      // Openingstijden uit de laatste pull (voor zaken zonder/eigen-lege tijden).
      const pull = (await this.getLatest(id)).openingHours;
      const known = owner || pull;
      // Open = eigen OF pull zegt open (permissief: liever een call te veel
      // dan een gemiste meting bij deels-lege eigen tijden). Bekend én dicht
      // → overslaan. Onbekend → tóch bellen (bootstrap).
      const openNow =
        this.isOpenNow(owner, now) || this.isOpenNow(pull, now);
      if (known && !openNow) {
        skipped++;
        results.push({
          restaurantId: id,
          placeId: null,
          hasPattern: false,
          livePct: null,
          skipped: 'gesloten',
        });
        continue;
      }
      try {
        results.push(await this.refreshRestaurant(id));
        called++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`live-refresh faalde voor ${id}: ${msg}`);
        results.push({
          restaurantId: id,
          placeId: null,
          hasPattern: false,
          livePct: null,
          skipped: `fout: ${msg}`,
        });
      }
    }
    this.logger.log(`live-refresh: ${called} gebeld, ${skipped} dicht/over.`);
    return { total: (data ?? []).length, called, skipped, results };
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
      .or('busyness_place_id.not.is.null,google_place_id.not.is.null');
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
