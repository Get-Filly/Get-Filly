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
import { ApifyClient } from './apify.client';
import { parseApifyPlace, type ApifyPlace, type OpeningHours } from './apify.parser';

const SOURCE = 'apify';

export interface RefreshResult {
  restaurantId: string;
  placeId: string | null;
  hasPattern: boolean;
  livePct: number | null;
  skipped?: string; // reden als er niets is weggeschreven
}

// Eén gedetecteerd rustig moment (dag + dagdeel), voorspellend uit het
// weekpatroon. Voedt de dashboard-markers, de chat-blokjes en de auto-
// detectie — allemaal via dezelfde bron.
export interface QuietMoment {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=ma..6=zo
  daypart: string; // ochtend|lunch|middag|diner|avond
  daypartLabel: string; // 'middag'
  expectedPct: number; // verwachte drukte in dat dagdeel (0-100)
  deviation: number; // werkelijk − voorspeld (negatief = rustiger dan verwacht)
  gap: number; // piek − dagdeel (vulbaarheid, punten)
  unusual: boolean; // ongewoon rustig (sterke afwijking) vs vaste rustige stand
  fromHour: number; // eerste open uur van het dagdeel (voor het rustig-venster)
  toHour: number; // laatste open uur van het dagdeel
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

// Vaste dagdeel-vensters (uur-grenzen, [from, to)). Een dagdeel wordt per zaak
// bijgesneden op de open uren (uren met patroon > 0); dagdelen zonder genoeg
// open uren tellen niet mee. Zo krijgt een lunchroom wél ochtend en een
// dinner-only zaak niet.
const DAYPART_DEFS: { key: string; label: string; from: number; to: number }[] =
  [
    { key: 'ochtend', label: 'ochtend', from: 6, to: 11 },
    { key: 'lunch', label: 'lunch', from: 11, to: 14 },
    { key: 'middag', label: 'middag', from: 14, to: 17 },
    { key: 'diner', label: 'diner', from: 17, to: 21 },
    { key: 'avond', label: 'avond', from: 21, to: 24 },
  ];

// Model-constanten voor de rustig-bepaling.
const MIN_COVERAGE = 2; // min. open uren voordat een dagdeel meetelt
const GAP_FLOOR = 15; // min. vulbaarheid: punten onder de eigen piek
const ABS_DEV_FLOOR = 2; // ondergrens (punten) voor vlakke zaken waar de schommeling ~0 is
const QUIET_SPREAD_MULT = 1.0; // rustig = zóveel × de normale schommeling onder verwachting
const UNUSUAL_SPREAD_MULT = 2.0; // toon 'ongewoon rustig' vanaf deze afwijking (× schommeling)
const DEFAULT_QUIET_PER_WEEK = 2; // tempo: max rustige momenten per week (instelbaar per zaak)

@Injectable()
export class BusynessService {
  private readonly logger = new Logger(BusynessService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly apify: ApifyClient,
  ) {}

  // "Nu" in Europe/Amsterdam als {weekday 0-6, hour 0-23}. Apify geeft
  // geen live-uur, dus dat leiden we hier af.
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

  // Drukte-bron van een restaurant-rij: eigen busyness-veld eerst, anders
  // terugval op de GBP-place_id.
  private placeIdOf(row: {
    busyness_place_id?: string | null;
    google_place_id?: string | null;
  }): string | null {
    return (row.busyness_place_id ?? row.google_place_id) || null;
  }

  // Schrijft één snapshot weg uit een Apify-plek. lite=true (live-cron):
  // alleen de live-meting (geen pattern/opening_hours/raw), zodat uur-ticks
  // niet het volledige patroon + ruwe JSON dupliceren. Geen live in
  // lite-modus → niks opslaan.
  private async writeSnapshot(
    restaurantId: string,
    placeId: string,
    place: ApifyPlace,
    lite: boolean,
  ): Promise<RefreshResult> {
    const { pattern, livePct, openingHours } = parseApifyPlace(place);
    const now = this.nowAmsterdam();
    const hasLive = livePct !== null;

    if (lite) {
      if (!hasLive) {
        return {
          restaurantId,
          placeId,
          hasPattern: false,
          livePct: null,
          skipped: 'geen live',
        };
      }
      const { error } = await this.supabase.client
        .from('busyness_snapshots')
        .insert({
          restaurant_id: restaurantId,
          place_id: placeId,
          source: SOURCE,
          live_pct: livePct,
          live_hour: now.hour,
          live_weekday: now.weekday,
        });
      if (error) throw new InternalServerErrorException(error.message);
      this.logger.log(`busyness ${restaurantId}: live-tick ${livePct}`);
      return { restaurantId, placeId, hasPattern: false, livePct };
    }

    // Volledige rij (wekelijkse/handmatige refresh): patroon + openingstijden.
    const { error } = await this.supabase.client
      .from('busyness_snapshots')
      .insert({
        restaurant_id: restaurantId,
        place_id: placeId,
        source: SOURCE,
        pattern, // 7x24 verwacht, of null bij kleine zaak
        opening_hours: openingHours, // uit Apify openingHours, voor grafiek-x-as
        live_pct: livePct,
        live_hour: hasLive ? now.hour : null,
        live_weekday: hasLive ? now.weekday : null,
        raw: place as unknown as Record<string, unknown>,
      });
    if (error) throw new InternalServerErrorException(error.message);
    this.logger.log(
      `busyness ${restaurantId}: pattern=${pattern ? 'ja' : 'nee'} live=${livePct ?? '-'}`,
    );
    return { restaurantId, placeId, hasPattern: pattern !== null, livePct };
  }

  // Batched kern: haalt alle place_ids in ÉÉN Apify-run op en schrijft per
  // restaurant een snapshot. Eén kapotte plek blokkeert de rest niet.
  private async batchRefresh(
    targets: { id: string; placeId: string }[],
    lite: boolean,
  ): Promise<RefreshResult[]> {
    if (!targets.length) return [];
    let places: Map<string, ApifyPlace>;
    try {
      places = await this.apify.fetchPlaces(targets.map((t) => t.placeId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Apify-run faalde: ${msg}`);
      return targets.map((t) => ({
        restaurantId: t.id,
        placeId: t.placeId,
        hasPattern: false,
        livePct: null,
        skipped: `fout: ${msg}`,
      }));
    }

    const results: RefreshResult[] = [];
    for (const t of targets) {
      const place = places.get(t.placeId);
      if (!place) {
        results.push({
          restaurantId: t.id,
          placeId: t.placeId,
          hasPattern: false,
          livePct: null,
          skipped: 'geen Apify-resultaat',
        });
        continue;
      }
      try {
        results.push(await this.writeSnapshot(t.id, t.placeId, place, lite));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`snapshot-write faalde voor ${t.id}: ${msg}`);
        results.push({
          restaurantId: t.id,
          placeId: t.placeId,
          hasPattern: false,
          livePct: null,
          skipped: `fout: ${msg}`,
        });
      }
    }
    return results;
  }

  /**
   * Ververst één restaurant (handmatige trigger). Overslaan als er geen
   * place_id of geen Apify-resultaat is.
   */
  async refreshRestaurant(
    restaurantId: string,
    opts?: { lite?: boolean },
  ): Promise<RefreshResult> {
    const { data: rest, error } = await this.supabase.client
      .from('restaurants')
      .select('id, busyness_place_id, google_place_id')
      .eq('id', restaurantId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!rest) throw new NotFoundException('Restaurant niet gevonden.');

    const placeId = this.placeIdOf(rest);
    if (!placeId) {
      return {
        restaurantId,
        placeId: null,
        hasPattern: false,
        livePct: null,
        skipped: 'geen place_id',
      };
    }
    const results = await this.batchRefresh(
      [{ id: restaurantId, placeId }],
      opts?.lite ?? false,
    );
    return results[0];
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

  // Verwachte drukte per dag uit het weekpatroon (spiegelt fase A's
  // isQuiet). Voor Filly's context + auto-detectie. hasSource=false als er
  // (nog) geen echt patroon is → caller valt terug op occupancy_days.
  async getDailyExpectation(
    restaurantId: string,
    fromIso: string,
    toIso: string,
    threshold: number,
  ): Promise<{
    hasSource: boolean;
    days: {
      date: string;
      weekday: number; // 0=ma..6=zo
      expectedPct: number; // gemiddelde over actieve uren
      level: 'rustig' | 'normaal' | 'druk';
      quiet: boolean; // expectedPct < threshold
    }[];
  }> {
    const latest = await this.getLatest(restaurantId);
    if (!latest.pattern) return { hasSource: false, days: [] };
    const pattern = latest.pattern;

    // Gemiddelde over de ACTIEVE uren (waar Google een waarde >0 geeft ≈
    // openingsuren) per weekdag.
    const avgActive = (row: number[] | undefined): number => {
      if (!row) return 0;
      const active = row.filter((v) => v > 0);
      if (!active.length) return 0;
      return Math.round(active.reduce((a, b) => a + b, 0) / active.length);
    };
    const weekAvg = [0, 1, 2, 3, 4, 5, 6].map((wd) => avgActive(pattern[wd]));
    const weekMean =
      weekAvg.reduce((a, b) => a + b, 0) / (weekAvg.filter((v) => v).length || 1);

    const days: {
      date: string;
      weekday: number;
      expectedPct: number;
      level: 'rustig' | 'normaal' | 'druk';
      quiet: boolean;
    }[] = [];
    for (const date of this.eachDate(fromIso, toIso)) {
      const weekday = this.mondayIndex(date);
      const expectedPct = weekAvg[weekday];
      // Niveau relatief aan het eigen weekgemiddelde (afwijking van eigen
      // patroon), rustig-detectie op de door de eigenaar ingestelde drempel.
      const level: 'rustig' | 'normaal' | 'druk' =
        expectedPct <= weekMean * 0.9
          ? 'rustig'
          : expectedPct >= weekMean * 1.1
            ? 'druk'
            : 'normaal';
      days.push({
        date,
        weekday,
        expectedPct,
        level,
        quiet: expectedPct < threshold,
      });
    }
    return { hasSource: true, days };
  }

  /**
   * Rustige momenten per dagdeel, voorspellend, voor een datumbereik. Draait op
   * het verwachte weekpatroon (geen live). Rekenwijze:
   *   1. Dagdeel-rooster: gemiddelde drukte per open uur, per (weekdag, dagdeel),
   *      op vaste vensters, bijgesneden op de open uren (min-dekking).
   *   2. Robuuste two-way ontleding (median polish): verwacht niveau per cel =
   *      overall + weekdag-effect + dagdeel-effect (medianen, dus ongevoelig voor
   *      uitschieters die anders hun eigen baseline zouden vervuilen).
   *   3. Afwijking = werkelijk − verwacht (het residu). Normale schommeling =
   *      robuuste MAD; rustig = buiten die schommeling onder verwachting.
   *   4. Kandidaat = vulbaar (gat t.o.v. eigen piek) én buiten de normale
   *      schommeling onder verwachting.
   *   5. Aaneengesloten rustige dagdelen op één dag = één kans (bv. diner +
   *      avond); max één kans per dag. Rangschikken en cappen op `perWeek`
   *      DAGEN per week.
   * hasSource=false als er (nog) geen echt patroon is → caller valt terug.
   */
  async getQuietMoments(
    restaurantId: string,
    fromIso: string,
    toIso: string,
    // Tempo (max per week). Niet meegegeven → de per-zaak-instelling
    // (quiet_moments_per_week), anders de default.
    perWeek?: number,
  ): Promise<{ hasSource: boolean; moments: QuietMoment[] }> {
    const latest = await this.getLatest(restaurantId);
    if (!latest.pattern || latest.pattern.length < 7) {
      return { hasSource: false, moments: [] };
    }
    const pattern = latest.pattern;
    const effectivePerWeek =
      perWeek ?? (await this.getQuietPerWeek(restaurantId));

    // 1. Dagdeel-rooster. cel = gemiddelde drukte per open uur; null = onder
    //    min-dekking → telt niet mee. from/to = het open-uur-venster (voor de
    //    rustig-band op de grafiek).
    type Cell = { avg: number; from: number; to: number };
    const cells: (Cell | null)[][] = pattern.map((row) =>
      DAYPART_DEFS.map((dp) => {
        const hrs: number[] = [];
        for (let h = dp.from; h < dp.to; h++) if ((row[h] ?? 0) > 0) hrs.push(h);
        if (hrs.length < MIN_COVERAGE) return null;
        const sum = hrs.reduce((a, h) => a + row[h], 0);
        return { avg: sum / hrs.length, from: hrs[0], to: hrs[hrs.length - 1] };
      }),
    );

    // 2. Robuuste two-way ontleding (median polish): niveau + weekdag-effect +
    //    dagdeel-effect, met medianen i.p.v. gemiddelden zodat één rustige
    //    uitschieter z'n eigen baseline niet vervuilt. `residual` = wat overblijft
    //    = de afwijking (werkelijk − verwacht); negatief = rustiger dan verwacht.
    const grid: (number | null)[][] = cells.map((row) =>
      row.map((c) => (c ? c.avg : null)),
    );
    const { residual } = this.medianPolish(grid);

    // Piek (drukste dagdeel) + alle residu-waarden voor de schommeling.
    let peak = 0;
    const resVals: number[] = [];
    cells.forEach((row, d) =>
      row.forEach((c, j) => {
        if (!c) return;
        if (c.avg > peak) peak = c.avg;
        const r = residual[d][j];
        if (r != null) resVals.push(r);
      }),
    );
    if (!resVals.length || !peak) return { hasSource: true, moments: [] };

    // 3. Normale schommeling = robuuste MAD (mediane absolute afwijking t.o.v. de
    //    mediaan), op std-schaal gebracht (×1,4826) zodat de multiplier intuïtief
    //    blijft. Grenzen: rustig = buiten die schommeling onder verwachting,
    //    'ongewoon' = duidelijk verder eronder. ABS_DEV_FLOOR vangt vlakke zaken.
    const medRes = this.medianExact(resVals);
    const mad = this.medianExact(resVals.map((r) => Math.abs(r - medRes)));
    const spread = 1.4826 * mad || 1;
    const quietThreshold = -Math.max(ABS_DEV_FLOOR, QUIET_SPREAD_MULT * spread);
    const unusualThreshold = -Math.max(
      ABS_DEV_FLOOR,
      UNUSUAL_SPREAD_MULT * spread,
    );

    // 4. Kandidaat-dagdelen per datum verzamelen (met dagdeel-index j, nodig om
    //    aaneengesloten dagdelen hieronder samen te voegen).
    type PartCand = {
      j: number;
      label: string;
      key: string;
      dev: number;
      gap: number;
      from: number;
      to: number;
      expectedPct: number;
    };
    const perDate = new Map<string, PartCand[]>();
    for (const date of this.eachDate(fromIso, toIso)) {
      const weekday = this.mondayIndex(date);
      const arr: PartCand[] = [];
      DAYPART_DEFS.forEach((dp, j) => {
        const c = cells[weekday][j];
        const dev = residual[weekday][j];
        if (!c || dev == null) return;
        const gap = peak - c.avg;
        if (gap < GAP_FLOOR) return; // te weinig te vullen
        if (dev > quietThreshold) return; // binnen de normale schommeling
        arr.push({
          j,
          label: dp.label,
          key: dp.key,
          dev,
          gap,
          from: c.from,
          to: c.to,
          expectedPct: c.avg,
        });
      });
      if (arr.length) perDate.set(date, arr);
    }

    // 5. Per dag: aaneengesloten dagdelen (opeenvolgende j) samenvoegen tot één
    //    kans (bv. diner + avond = één rustig blok). De sterkste aaneengesloten
    //    reeks is dé kans van die dag → max één kans per dag. Daarna rangschikken
    //    en het tempo cappen op het aantal DAGEN per week.
    type Kans = QuietMoment & { score: number; week: string };
    const runScore = (run: PartCand[]) =>
      Math.max(...run.map((p) => -p.dev / spread + p.gap / (peak || 1)));
    const dayKansen: Kans[] = [];
    for (const [date, parts] of perDate) {
      parts.sort((a, b) => a.j - b.j);
      const runs: PartCand[][] = [];
      for (const p of parts) {
        const last = runs[runs.length - 1];
        if (last && p.j === last[last.length - 1].j + 1) last.push(p);
        else runs.push([p]);
      }
      const best = runs.reduce((a, b) => (runScore(b) > runScore(a) ? b : a));
      const devMin = Math.min(...best.map((p) => p.dev)); // sterkste afwijking
      const gapMax = Math.max(...best.map((p) => p.gap));
      dayKansen.push({
        date,
        weekday: this.mondayIndex(date),
        daypart: best[0].key,
        daypartLabel: this.joinDayparts(best.map((p) => p.label)),
        expectedPct: Math.round(
          best.reduce((s, p) => s + p.expectedPct, 0) / best.length,
        ),
        deviation: Math.round(devMin * 10) / 10,
        gap: Math.round(gapMax),
        unusual: devMin <= unusualThreshold,
        fromHour: Math.min(...best.map((p) => p.from)),
        toHour: Math.max(...best.map((p) => p.to)),
        score: runScore(best),
        week: this.mondayOf(date),
      });
    }

    dayKansen.sort((a, b) => b.score - a.score);
    const perWeekCount = new Map<string, number>();
    const picked: Kans[] = [];
    for (const k of dayKansen) {
      if ((perWeekCount.get(k.week) ?? 0) >= effectivePerWeek) continue;
      perWeekCount.set(k.week, (perWeekCount.get(k.week) ?? 0) + 1);
      picked.push(k);
    }
    picked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const moments: QuietMoment[] = picked.map((k) => ({
      date: k.date,
      weekday: k.weekday,
      daypart: k.daypart,
      daypartLabel: k.daypartLabel,
      expectedPct: k.expectedPct,
      deviation: k.deviation,
      gap: k.gap,
      unusual: k.unusual,
      fromHour: k.fromHour,
      toHour: k.toHour,
    }));
    return { hasSource: true, moments };
  }

  // Dagdeel-labels natuurlijk aan elkaar: ["diner","avond"] → "diner en avond".
  private joinDayparts(labels: string[]): string {
    if (labels.length <= 1) return labels[0] ?? '';
    return `${labels.slice(0, -1).join(', ')} en ${labels[labels.length - 1]}`;
  }

  /**
   * De dagdelen waarin de zaak op deze datum OPEN is (uren met patroon > 0,
   * min-dekking), met hun venster. Voor de geleide flow: zodat de eigenaar een
   * ander dagdeel dan het gedetecteerde kan kiezen. Leeg zonder patroon.
   */
  async getDaypartsForDate(
    restaurantId: string,
    dateIso: string,
  ): Promise<
    { key: string; label: string; fromHour: number; toHour: number }[]
  > {
    const latest = await this.getLatest(restaurantId);
    if (!latest.pattern || latest.pattern.length < 7) return [];
    const row = latest.pattern[this.mondayIndex(dateIso)] ?? [];
    const out: { key: string; label: string; fromHour: number; toHour: number }[] =
      [];
    for (const dp of DAYPART_DEFS) {
      const hrs: number[] = [];
      for (let h = dp.from; h < dp.to; h++) if ((row[h] ?? 0) > 0) hrs.push(h);
      if (hrs.length < MIN_COVERAGE) continue;
      out.push({
        key: dp.key,
        label: dp.label,
        fromHour: hrs[0],
        toHour: hrs[hrs.length - 1],
      });
    }
    return out;
  }

  // Het per-zaak ingestelde tempo (quiet_moments_per_week); default als leeg.
  private async getQuietPerWeek(restaurantId: string): Promise<number> {
    const { data } = await this.supabase.client
      .from('restaurants')
      .select('quiet_moments_per_week')
      .eq('id', restaurantId)
      .maybeSingle();
    const v = data?.quiet_moments_per_week as number | null | undefined;
    return typeof v === 'number' && v >= 1 ? v : DEFAULT_QUIET_PER_WEEK;
  }

  // Exacte mediaan (zonder afronding) — voor median polish + MAD.
  private medianExact(nums: number[]): number {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /**
   * Median polish (Tukey): robuuste two-way ontleding van een tabel in
   *   waarde = overall + rijEffect + kolomEffect + residu.
   * Werkt met medianen i.p.v. gemiddelden, dus ongevoelig voor uitschieters
   * (juist de dips die we zoeken vervuilen dan hun eigen baseline niet). Lege
   * cellen (null) doen niet mee aan de medianen en houden residu = null.
   */
  private medianPolish(matrix: (number | null)[][]): {
    overall: number;
    rowEff: number[];
    colEff: number[];
    residual: (number | null)[][];
  } {
    const R = matrix.length;
    const C = matrix[0]?.length ?? 0;
    const res: (number | null)[][] = matrix.map((row) => row.slice());
    const rowEff = new Array<number>(R).fill(0);
    const colEff = new Array<number>(C).fill(0);
    let overall = 0;

    for (let iter = 0; iter < 10; iter++) {
      let maxShift = 0;
      // Rijen: trek de rij-mediaan eraf, tel op bij het rij-effect.
      for (let d = 0; d < R; d++) {
        const vals = res[d].filter((v): v is number => v != null);
        if (!vals.length) continue;
        const m = this.medianExact(vals);
        for (let j = 0; j < C; j++) {
          if (res[d][j] != null) res[d][j] = (res[d][j] as number) - m;
        }
        rowEff[d] += m;
        maxShift = Math.max(maxShift, Math.abs(m));
      }
      // Centreer de rij-effecten in het overall-niveau.
      const rm = this.medianExact(rowEff);
      for (let d = 0; d < R; d++) rowEff[d] -= rm;
      overall += rm;
      // Kolommen: idem.
      for (let j = 0; j < C; j++) {
        const vals: number[] = [];
        for (let d = 0; d < R; d++) {
          const v = res[d][j];
          if (v != null) vals.push(v);
        }
        if (!vals.length) continue;
        const m = this.medianExact(vals);
        for (let d = 0; d < R; d++) {
          if (res[d][j] != null) res[d][j] = (res[d][j] as number) - m;
        }
        colEff[j] += m;
        maxShift = Math.max(maxShift, Math.abs(m));
      }
      const cm = this.medianExact(colEff);
      for (let j = 0; j < C; j++) colEff[j] -= cm;
      overall += cm;

      if (maxShift < 0.01) break; // gestabiliseerd
    }
    return { overall, rowEff, colEff, residual: res };
  }

  // Maandag (YYYY-MM-DD) van de week waarin `iso` valt — weeksleutel voor de cap.
  private mondayOf(iso: string): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - this.mondayIndex(iso));
    return d.toISOString().slice(0, 10);
  }

  // Weekdag 0=ma..6=zo voor een YYYY-MM-DD (UTC-noon → tz-veilig).
  private mondayIndex(iso: string): number {
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=zo..6=za
    return (dow + 6) % 7; // 0=ma..6=zo
  }

  // Itereer YYYY-MM-DD van..t/m (inclusief).
  private *eachDate(fromIso: string, toIso: string): Generator<string> {
    const d = new Date(`${fromIso}T12:00:00Z`);
    const end = new Date(`${toIso}T12:00:00Z`);
    while (d <= end) {
      yield d.toISOString().slice(0, 10);
      d.setUTCDate(d.getUTCDate() + 1);
    }
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
   * Uurlijkse live-meting: haalt in ÉÉN Apify-run de plekken op van alle
   * zaken die NU open zijn (bespaart scrapes buiten openingstijden).
   * Onbekende openingstijden (nog nooit gepulld) → tóch meenemen (bootstrap).
   */
  async refreshLive(): Promise<{
    total: number;
    called: number;
    skipped: number;
    results: RefreshResult[];
  }> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('id, opening_hours, busyness_place_id, google_place_id')
      .or('busyness_place_id.not.is.null,google_place_id.not.is.null');
    if (error) throw new InternalServerErrorException(error.message);

    const now = this.nowAmsterdam();
    const results: RefreshResult[] = [];
    const open: { id: string; placeId: string }[] = [];

    for (const r of data ?? []) {
      const placeId = this.placeIdOf(r);
      if (!placeId) continue;
      const owner = (r.opening_hours as OpeningHours | null) ?? null;
      // Openingstijden uit de laatste pull (voor zaken zonder/eigen-lege tijden).
      const pull = (await this.getLatest(r.id as string)).openingHours;
      const known = owner || pull;
      // Open = eigen OF pull zegt open (permissief: liever een scrape te veel
      // dan een gemiste meting). Bekend én dicht → overslaan. Onbekend →
      // tóch meenemen (bootstrap).
      const openNow = this.isOpenNow(owner, now) || this.isOpenNow(pull, now);
      if (known && !openNow) {
        results.push({
          restaurantId: r.id as string,
          placeId,
          hasPattern: false,
          livePct: null,
          skipped: 'gesloten',
        });
        continue;
      }
      open.push({ id: r.id as string, placeId });
    }

    const written = await this.batchRefresh(open, true);
    results.push(...written);
    this.logger.log(
      `live-refresh: ${open.length} gebeld, ${results.length - open.length} dicht/over.`,
    );
    return {
      total: results.length,
      called: open.length,
      skipped: results.length - open.length,
      results,
    };
  }

  /**
   * Ververst alle restaurants met een place_id in ÉÉN Apify-run
   * (volledige rij: patroon + openingstijden). Prunet daarna oude rijen.
   */
  async refreshAll(): Promise<{
    total: number;
    refreshed: number;
    pruned: number;
    results: RefreshResult[];
  }> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select('id, busyness_place_id, google_place_id')
      .or('busyness_place_id.not.is.null,google_place_id.not.is.null');
    if (error) throw new InternalServerErrorException(error.message);

    const targets = (data ?? [])
      .map((r) => ({ id: r.id as string, placeId: this.placeIdOf(r) }))
      .filter((t): t is { id: string; placeId: string } => !!t.placeId);

    const results = await this.batchRefresh(targets, false);
    const refreshed = results.filter(
      (r) => r.hasPattern || r.livePct !== null,
    ).length;
    this.logger.log(
      `busyness-refresh klaar: ${refreshed}/${targets.length} met data.`,
    );

    // Oude snapshots opruimen (de wekelijkse refresh is een mooi moment).
    // Live-metingen > 120 dagen zijn ruim voldoende voor de mediaan-per-
    // weekdag; oudere rijen (incl. verouderde patronen) mogen weg.
    const pruned = await this.pruneOldSnapshots().catch((e) => {
      this.logger.warn(`Prune faalde: ${String(e)}`);
      return 0;
    });

    return { total: targets.length, refreshed, pruned, results };
  }

  /**
   * Verwijdert snapshots ouder dan keepDays. Veilig omdat de wekelijkse
   * refresh telkens een vers patroon wegschrijft, dus de laatste
   * (verwacht-)snapshot blijft altijd recent.
   */
  async pruneOldSnapshots(keepDays = 120): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .delete()
      .lt('captured_at', cutoff.toISOString())
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    const n = data?.length ?? 0;
    if (n) this.logger.log(`busyness-prune: ${n} oude snapshots verwijderd.`);
    return n;
  }
}
