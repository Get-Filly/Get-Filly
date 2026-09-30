import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Service-role client: busyness_snapshots heeft RLS aan zonder policies,
// dus alleen de service-role mag hier lezen/schrijven. De tenant-isolatie
// op de handmatige endpoint komt van de BusinessAccessGuard.
import { SupabaseService } from '../supabase/supabase.service';
import { ApifyClient } from './apify.client';
import {
  parseApifyPlace,
  type ApifyPlace,
  type OpeningHours,
} from './apify.parser';
import { EventsService } from '../events/events.service';
import { OpenMeteoClient } from '../weather/open-meteo.client';
import { getNlHolidays } from '../ai/timing-factors';
import { QUIET_PARAMS, SIGNAL_PARAMS, type QuietParams } from './quiet-params';
import { computeQuiet } from './quiet-model';
import { aggregateDaily, buildDayContext } from './daily-rollup';
import { QuietFeedbackService } from './quiet-feedback.service';
import { WeatherSnapshotService } from '../weather/weather-snapshot.service';
import {
  DAYPART_DEFS,
  COOLDOWN_WEEKS,
  normalizeDaypart,
  type EventSignal,
  type HourlyWeather,
  type QuietNote,
  type QuietReason,
  type SlotPerformance,
  type WeatherSignal,
} from './quiet-signals';

const SOURCE = 'apify';

export interface RefreshResult {
  businessId: string;
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
  daypart: string; // ochtend|lunch|middag|diner
  // Alle dagdeel-sleutels in deze kans, op volgorde. De frontend vertaalt
  // hiermee zelf; `daypartLabel` is een Nederlandse zin en hoort dus alleen
  // in de prompts thuis, niet in de UI (de app is NL/EN).
  dayparts: string[];
  // Beslaat dit blok élk dagdeel waarop de zaak die dag open is? Dan is
  // "de hele dag" de eerlijke omschrijving; een opsomming als "lunch,
  // middag, diner en avond" leest raar (lunch zit in de middag, diner in
  // de avond) en zegt precies hetzelfde.
  coversOpenDay: boolean;
  daypartLabel: string; // 'middag en diner' — NL, voor prompts/trigger_context
  expectedPct: number; // verwachte drukte in dat dagdeel (0-100), incl. datum-signalen
  deviation: number; // werkelijk − voorspeld (negatief = rustiger dan verwacht)
  gap: number; // piek − dagdeel (vulbaarheid, punten)
  unusual: boolean; // ongewoon rustig (sterke afwijking) vs vaste rustige stand
  fromHour: number; // eerste open uur van het dagdeel (voor het rustig-venster)
  toHour: number; // laatste open uur van het dagdeel
  // Structureel = deze weekdag is hier altijd stil (strategisch, meerwekenplan).
  // Incidenteel = juist déze datum wijkt af door weer of een evenement
  // (tactisch, met houdbaarheidsdatum). De chat en het dashboard mogen die
  // twee anders behandelen.
  kind: 'structureel' | 'incidenteel';
  // Waarom juist deze dag, als key + params — de frontend is NL/EN, dus een
  // in de backend gebakken zin zou op de Engelse kaart Nederlands zijn.
  reasonKey: QuietReason['reasonKey'];
  reasonParams: Record<string, string | number>;
}

/** Wat getQuietMoments teruggeeft; `notes` = dagen die een harde poort raakten. */
export interface QuietMomentsResult {
  hasSource: boolean;
  moments: QuietMoment[];
  notes: QuietNote[];
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

// Model-constanten voor de rustig-bepaling.
// ------------------------------------------------------------
// Model = VULBAARHEID-FIRST (2026-08-06). Hoofdmaat is de `gap`: hoeveel
// een dagdeel structureel onder de eigen piek zit = hoeveel er te vullen is.
// De anomalie (median-polish-restant t.o.v. wat dat weekdag×dagdeel normaal
// doet) is GEEN poort meer maar een RANKING-BONUS + het 'ongewoon rustig'-
// label. Zo komen structureel-lege dagen (ma/di) — je beste campagne-targets
// — weer bovendrijven, terwijl een verrassende dip alsnog extra omhoog scoort.
// (Voorheen was het pure anomalie-detectie, die juist die structureel-lege
// dagen wegfilterde als "geen afwijking, dus geen kans".)
// Hoe ver het maandoverzicht terugkijkt. Gelijk aan de retentie van
// busyness_snapshots: verder terug is de bron toch al geprund, en het hele
// venster meenemen laat een overgeslagen run zichzelf repareren.
const MONTHLY_LOOKBACK_DAYS = 120;
// Zelfde venster voor het dagoverzicht: gelijk aan de retentie van de ruwe metingen.
const DAILY_LOOKBACK_DAYS = 120;

// Eén gebruik van een weekdag×dagdeel-slot, voor de cool-down. `weekIndex` is
// de week t.o.v. de eerste week van het opgevraagde venster (historie is dus
// negatief); `weak` = we kennen alleen de weekdag, niet het dagdeel.
type SlotUse = { weekIndex: number; weak?: boolean };

// Alles wat per kalenderdatum verschilt, in één keer geladen voor het venster.
type QuietContext = {
  // Feestdagen in het venster waarop de eigenaar wil inspelen (bonus).
  holidayByDate: Map<string, string>;
  eventsByDate: Map<string, EventSignal[]>;
  weatherByDate: Map<string, WeatherSignal>;
  // Weer per uur, voor het weer over het voorgestelde tijdvenster.
  weatherHourlyByDate: Map<string, HourlyWeather>;
  hasTerrace: boolean;
  covered: Set<string>;
  recentSlots: Map<string, SlotUse[]>;
  // Fase 4: wat campagnes per weekdag×dagdeel eerder deden met de drukte,
  // plus de eigen mediaan van de zaak als ijkpunt.
  slotPerformance: Map<string, SlotPerformance>;
  businessMedianLift: number;
};

// Lege context = geen enkel datum-signaal en geen beleid: het model draait dan
// op het patroon alleen, precies zoals vóór 2026-09-15. Dit is ook de fallback
// als elke bron wegvalt.
const EMPTY_QUIET_CONTEXT: QuietContext = {
  holidayByDate: new Map(),
  eventsByDate: new Map(),
  weatherByDate: new Map(),
  weatherHourlyByDate: new Map(),
  hasTerrace: false,
  covered: new Set(),
  recentSlots: new Map(),
  slotPerformance: new Map(),
  businessMedianLift: 0,
};

/** Eén live-meting zoals hij uit busyness_snapshots komt. */
export type LiveRow = {
  captured_at: string;
  live_pct: number;
  live_hour: number | null;
};

export type OccupancyHourly = {
  weekday: number;
  hour: number;
  actual: number | null;
  days: number;
};

export type OccupancyDaypart = {
  weekday: number;
  daypart: string;
  expected: number;
  actual: number;
  diff: number;
  hours: number;
  days: number;
};

/**
 * De rekenkern van de bezettingsrapportage, puur zodat 'ie zonder database
 * te testen is. Zie getOccupancyReport voor het waarom van de twee stappen
 * en van de "verwachting over precies dezelfde uren"-regel.
 */
export function aggregateOccupancyReport(
  rows: LiveRow[],
  pattern: number[][] | null,
  minDays: number,
): { hourly: OccupancyHourly[]; dayparts: OccupancyDaypart[] } {
  const med = (nums: number[]): number => {
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const amsDate = (d: Date): string => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? '01';
    return `${g('year')}-${g('month')}-${g('day')}`;
  };
  const amsHour = (d: Date): number =>
    parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit',
        hour12: false,
      }).format(d),
      10,
    );
  const weekdayOf = (iso: string): number =>
    (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

  // Stap 1: per (datum, uur) de mediaan van de metingen in dat uur.
  const bucket: Record<string, Record<number, number[]>> = {};
  for (const row of rows) {
    const when = new Date(row.captured_at);
    const date = amsDate(when);
    const hour = row.live_hour ?? amsHour(when);
    if (hour == null || hour < 0 || hour > 23) continue;
    (bucket[date] ??= {})[hour] ??= [];
    bucket[date][hour].push(row.live_pct);
  }

  // Stap 2: per (weekdag, uur) de mediaan over de datums.
  const perCell = new Map<string, number[]>();
  for (const [date, hours] of Object.entries(bucket)) {
    const wd = weekdayOf(date);
    for (const [h, pcts] of Object.entries(hours)) {
      const key = `${wd}|${h}`;
      const arr = perCell.get(key);
      if (arr) arr.push(med(pcts));
      else perCell.set(key, [med(pcts)]);
    }
  }

  const hourly: OccupancyHourly[] = [];
  const cellValue = new Map<string, number>();
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const vals = perCell.get(`${wd}|${h}`) ?? [];
      if (vals.length === 0) continue;
      const enough = vals.length >= minDays;
      const value = enough ? Math.round(med(vals)) : null;
      if (value !== null) cellValue.set(`${wd}|${h}`, value);
      hourly.push({ weekday: wd, hour: h, actual: value, days: vals.length });
    }
  }

  const dayparts: OccupancyDaypart[] = [];
  if (pattern && pattern.length >= 7) {
    for (let wd = 0; wd < 7; wd++) {
      for (const dp of DAYPART_DEFS) {
        const act: number[] = [];
        const exp: number[] = [];
        let days = 0;
        for (let h = dp.from; h < dp.to; h++) {
          const v = cellValue.get(`${wd}|${h}`);
          if (v === undefined) continue;
          const p = pattern[wd]?.[h] ?? 0;
          if (p <= 0) continue; // volgens Google dicht → niets te vergelijken
          act.push(v);
          exp.push(p);
          days = Math.max(days, (perCell.get(`${wd}|${h}`) ?? []).length);
        }
        if (act.length < QUIET_PARAMS.minCoverage) continue;
        const a = act.reduce((x, y) => x + y, 0) / act.length;
        const e = exp.reduce((x, y) => x + y, 0) / exp.length;
        dayparts.push({
          weekday: wd,
          daypart: dp.key,
          expected: Math.round(e),
          actual: Math.round(a),
          diff: Math.round(a - e),
          hours: act.length,
          days,
        });
      }
    }
  }
  return { hourly, dayparts };
}

export type MonthlyCell = {
  month: string; // YYYY-MM-01
  weekday: number;
  hour: number;
  actualPct: number;
  expectedPct: number | null;
  days: number;
};

/**
 * Maandoverzicht uit ruwe live-metingen. Zelfde meetdefinitie als de
 * rapportage: per (datum, uur) de mediaan van de metingen, daarna de mediaan
 * over de dagen — maar hier gegroepeerd per kalendermaand in plaats van over
 * het hele venster.
 *
 * `pattern` is het Google-weekpatroon zoals het NU is; dat wordt per cel
 * meebewaard als verwachting. Het patroon verschuift met de tijd, en zonder
 * de verwachting van toen valt een vergelijking met vorig jaar niet uit te
 * leggen.
 *
 * Puur, zodat 'ie zonder database te testen is.
 */
export function aggregateMonthly(
  rows: LiveRow[],
  pattern: number[][] | null,
): MonthlyCell[] {
  const med = (nums: number[]): number => {
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const amsDate = (d: Date): string => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? '01';
    return `${g('year')}-${g('month')}-${g('day')}`;
  };
  const amsHour = (d: Date): number =>
    parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit',
        hour12: false,
      }).format(d),
      10,
    );
  const weekdayOf = (iso: string): number =>
    (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

  // Stap 1: per (datum, uur) de mediaan van de metingen in dat uur.
  const perDateHour = new Map<string, number[]>();
  for (const row of rows) {
    const when = new Date(row.captured_at);
    const date = amsDate(when);
    const hour = row.live_hour ?? amsHour(when);
    if (hour == null || hour < 0 || hour > 23) continue;
    const key = `${date}|${hour}`;
    const arr = perDateHour.get(key);
    if (arr) arr.push(row.live_pct);
    else perDateHour.set(key, [row.live_pct]);
  }

  // Stap 2: groeperen per (maand, weekdag, uur).
  const perCell = new Map<string, number[]>();
  for (const [key, pcts] of perDateHour) {
    const [date, h] = key.split('|');
    const maand = `${date.slice(0, 7)}-01`;
    const wd = weekdayOf(date);
    const cell = `${maand}|${wd}|${h}`;
    const arr = perCell.get(cell);
    if (arr) arr.push(med(pcts));
    else perCell.set(cell, [med(pcts)]);
  }

  const out: MonthlyCell[] = [];
  for (const [cell, vals] of perCell) {
    const [month, wd, h] = cell.split('|');
    const weekday = Number(wd);
    const hour = Number(h);
    const exp = pattern?.[weekday]?.[hour];
    out.push({
      month,
      weekday,
      hour,
      actualPct: Math.round(med(vals) * 100) / 100,
      expectedPct: typeof exp === 'number' && exp > 0 ? exp : null,
      days: vals.length,
    });
  }
  // Stabiele volgorde; maakt de upsert-batches en de tests leesbaar.
  out.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.weekday - b.weekday ||
      a.hour - b.hour,
  );
  return out;
}

@Injectable()
export class BusynessService {
  private readonly logger = new Logger(BusynessService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly apify: ApifyClient,
    // Datum-signalen voor de rustige-momenten-detectie. Beide zijn
    // singletons: EventsService draait op de service-role-client en
    // OpenMeteoClient raakt Supabase niet. (WeatherService zelf is
    // Scope.REQUEST en zou deze service meetrekken — daarom de client.)
    private readonly events: EventsService,
    private readonly openMeteo: OpenMeteoClient,
    // Fase 4: de leerloop. Alleen gelezen tijdens de detectie; het meten
    // zelf draait in een cron.
    private readonly feedback: QuietFeedbackService,
    // Weer: vier vaste opnames per dag (mig 0081), niet live per aanroep.
    private readonly weatherSnapshots: WeatherSnapshotService,
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
    businessId: string,
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
          businessId,
          placeId,
          hasPattern: false,
          livePct: null,
          skipped: 'geen live',
        };
      }
      const { error } = await this.supabase.client
        .from('busyness_snapshots')
        .insert({
          business_id: businessId,
          place_id: placeId,
          source: SOURCE,
          live_pct: livePct,
          live_hour: now.hour,
          live_weekday: now.weekday,
        });
      if (error) throw new InternalServerErrorException(error.message);
      this.logger.log(`busyness ${businessId}: live-tick ${livePct}`);
      return { businessId, placeId, hasPattern: false, livePct };
    }

    // Volledige rij (wekelijkse/handmatige refresh): patroon + openingstijden.
    const { error } = await this.supabase.client
      .from('busyness_snapshots')
      .insert({
        business_id: businessId,
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
      `busyness ${businessId}: pattern=${pattern ? 'ja' : 'nee'} live=${livePct ?? '-'}`,
    );
    return { businessId, placeId, hasPattern: pattern !== null, livePct };
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
        businessId: t.id,
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
          businessId: t.id,
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
          businessId: t.id,
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
    businessId: string,
    opts?: { lite?: boolean },
  ): Promise<RefreshResult> {
    const { data: rest, error } = await this.supabase.client
      .from('businesses')
      .select('id, busyness_place_id, google_place_id')
      .eq('id', businessId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!rest) throw new NotFoundException('Business niet gevonden.');

    const placeId = this.placeIdOf(rest);
    if (!placeId) {
      return {
        businessId,
        placeId: null,
        hasPattern: false,
        livePct: null,
        skipped: 'geen place_id',
      };
    }
    const results = await this.batchRefresh(
      [{ id: businessId, placeId }],
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
  async getLatest(businessId: string): Promise<{
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
      .eq('business_id', businessId)
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
    businessId: string,
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
    const latest = await this.getLatest(businessId);
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
      weekAvg.reduce((a, b) => a + b, 0) /
      (weekAvg.filter((v) => v).length || 1);

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
   * Rustige momenten, voorspellend, voor een datumbereik. De rekenkern staat
   * in quiet-model.ts (met uitleg per stap); deze methode haalt alleen op wat
   * het model nodig heeft en vertaalt de uitkomst naar QuietMoment.
   *
   * `opts.applyPolicy = false` slaat de beleidslaag, de datum-signalen en de
   * eigenaar-instelling "Mijn momenten" volledig over en geeft het kale
   * patroon-model terug. Nodig voor de aanroepers die vragen "wélk dagdeel is
   * rustig op déze datum" voor een dag die de eigenaar zélf koos (de geleide
   * flow): een bewuste keuze wordt nooit weggefilterd.
   *
   * Fail-soft: valt een signaalbron weg (weer, events, of de DB-lezingen voor
   * de beleidslaag), dan draait het model door op het patroon alleen.
   *
   * hasSource=false als er (nog) geen echt patroon is → caller valt terug.
   */
  async getQuietMoments(
    businessId: string,
    fromIso: string,
    toIso: string,
    // Tempo (max per week). Niet meegegeven → de per-zaak-instelling
    // (quiet_moments_per_week), anders de default.
    perWeek?: number,
    // `params` overschrijft de standaardwaarden uit quiet-params.ts (tests, speeltuin).
    opts?: { applyPolicy?: boolean; params?: Partial<QuietParams> },
  ): Promise<QuietMomentsResult> {
    const applyPolicy = opts?.applyPolicy ?? true;
    const latest = await this.getLatest(businessId);
    if (!latest.pattern || latest.pattern.length < 7) {
      return { hasSource: false, moments: [], notes: [] };
    }
    const effectivePerWeek =
      perWeek ?? (await this.getQuietPerWeek(businessId));
    // Tijdvenster (mig 0069): null = geen beperking (hele open dag).
    const window = await this.getQuietWindow(businessId);

    // Datum-signalen + beleids-historie. Alles fail-soft; een lege context
    // levert het kale patroon-model op.
    const ctx = applyPolicy
      ? await this.loadQuietContext(businessId, fromIso, toIso)
      : EMPTY_QUIET_CONTEXT;
    // Door de eigenaar uitgezette momenten ("Mijn momenten", mig 0080).
    const disabledSlots = applyPolicy
      ? await this.getDisabledSlots(businessId)
      : new Set<string>();

    const result = computeQuiet(
      latest.pattern,
      fromIso,
      toIso,
      effectivePerWeek,
      {
        window,
        weather: ctx.weatherByDate,
        weatherHourly: ctx.weatherHourlyByDate,
        events: ctx.eventsByDate,
        hasTerrace: ctx.hasTerrace,
        planned: ctx.covered,
        holidays: ctx.holidayByDate,
        disabledSlots,
        recentSlots: ctx.recentSlots,
        slotPerformance: ctx.slotPerformance,
        businessMedianLift: ctx.businessMedianLift,
        noPolicy: !applyPolicy,
      },
      opts?.params,
    );

    const moments: QuietMoment[] = result.moments.map((m) => ({
      date: m.date,
      weekday: m.weekday,
      daypart: m.daypart,
      dayparts: [m.daypart],
      coversOpenDay: false,
      daypartLabel: m.daypart,
      expectedPct: m.expectedPct,
      deviation: m.deviation,
      gap: m.gap,
      unusual: m.unusual,
      fromHour: m.fromHour,
      // Het model levert een half-open venster [van, tot); de consumenten
      // verwachten het laatste uur zelf (inclusief).
      toHour: m.toHour - 1,
      kind: m.kind,
      reasonKey: m.reasonKey,
      reasonParams: m.reasonParams,
    }));

    // Dagen die een harde poort raakten, zodat het dashboard kan zeggen waarom
    // er (nog) geen voorstel voor is: alleen nog dagen waar al iets voor staat.
    const notes: QuietNote[] = [];
    if (applyPolicy) {
      for (const date of this.eachDate(fromIso, toIso)) {
        if (ctx.covered.has(date)) notes.push({ date, reason: 'al_afgedekt' });
      }
    }
    return { hasSource: true, moments, notes };
  }

  // De momenten die de eigenaar heeft uitgezet (mig 0080), als
  // "weekdag|dagdeel". Leeg bij een fout of ontbrekende kolom: dan blijft
  // alles aan.
  private async getDisabledSlots(businessId: string): Promise<Set<string>> {
    const { data, error } = await this.supabase.client
      .from('businesses')
      .select('quiet_disabled_slots')
      .eq('id', businessId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`quiet_disabled_slots lezen faalde: ${error.message}`);
      return new Set();
    }
    const v = data?.quiet_disabled_slots as string[] | null | undefined;
    return new Set(Array.isArray(v) ? v : []);
  }

  /**
   * Laadt alles wat per KALENDERDATUM verschilt, in één keer voor het hele
   * venster. Elke bron apart fail-soft: een wegvallende bron levert een lege
   * map op en daarmee exact het oude, patroon-only gedrag.
   */
  private async loadQuietContext(
    businessId: string,
    fromIso: string,
    toIso: string,
  ): Promise<QuietContext> {
    // Feestdagen zijn pure code (deterministisch, Meeus) — geen IO, geen
    // fail-soft nodig. Alle jaren die het venster raakt.
    // Staan feestdagen bij deze zaak aan (mig 0055), en welke heeft de eigenaar
    // per stuk uitgezet (mig 0082)? Uitgezette feestdagen krijgen geen bonus.
    const holidaysOn = await this.events.holidaysEnabled(businessId);
    const disabledHolidays = await this.events.disabledHolidays(businessId);
    const holidayByDate = new Map<string, string>();
    const years = new Set<number>([
      Number(fromIso.slice(0, 4)),
      Number(toIso.slice(0, 4)),
    ]);
    for (const y of years) {
      if (!Number.isFinite(y)) continue;
      for (const h of getNlHolidays(y)) {
        if (h.date < fromIso || h.date > toIso) continue;
        if (!holidaysOn || disabledHolidays.has(h.id)) continue;
        holidayByDate.set(h.date, h.name);
      }
    }

    const [profile, covered, recentSlots, events, performance] =
      await Promise.all([
        this.getQuietProfile(businessId),
        this.getCoveredDates(businessId, fromIso, toIso),
        this.getRecentSlots(businessId, fromIso),
        this.events.findNearbyInRange(businessId, fromIso, toIso).catch((e) => {
          this.logger.warn(`events-signaal faalde: ${String(e)}`);
          return [] as Awaited<ReturnType<EventsService['findNearbyInRange']>>;
        }),
        this.feedback.getSlotPerformance(businessId).catch((e) => {
          this.logger.warn(`slot-prestaties faalden: ${String(e)}`);
          return {
            slots: new Map<string, SlotPerformance>(),
            businessMedianLift: 0,
          };
        }),
      ]);

    const eventsByDate = new Map<string, EventSignal[]>();
    for (const e of events) {
      const arr = eventsByDate.get(e.startsOn);
      const signal: EventSignal = {
        name: e.name,
        category: e.category,
        place: e.place,
        distanceKm: e.distanceKm,
        // findNearbyInRange heeft de staffel al toegepast, dus de afstand valt
        // binnen de radius van deze categorie. Die radius is hier de schaal
        // waarop we nabijheid wegen.
        radiusKm: SIGNAL_PARAMS.eventRadiusKm[e.category] ?? 5,
      };
      if (arr) arr.push(signal);
      else eventsByDate.set(e.startsOn, [signal]);
    }

    // Weer: alleen zinvol binnen de 7-daagse Open-Meteo-horizon. Daarbuiten
    // geen entry → factor 1. Dat is hetzelfde codepad als "weerbron weg", dus
    // die fallback loopt elke aanroep sowieso mee.
    // Weer per uur uit de laatste opname (een van de vier per dag). Het
    // daggemiddelde is niet meer nodig: het model kijkt naar het weer over het
    // voorgestelde tijdvenster.
    const weatherByDate = new Map<string, WeatherSignal>();
    const weatherHourlyByDate = new Map<string, HourlyWeather>();
    if (profile.latitude != null && profile.longitude != null) {
      const hourly = await this.weatherSnapshots.getHourly(
        profile.latitude,
        profile.longitude,
      );
      for (const [date, h] of hourly) {
        if (date >= fromIso && date <= toIso) weatherHourlyByDate.set(date, h);
      }
    }

    return {
      holidayByDate,
      eventsByDate,
      weatherByDate,
      weatherHourlyByDate,
      hasTerrace: profile.hasTerrace,
      covered,
      recentSlots,
      slotPerformance: performance.slots,
      businessMedianLift: performance.businessMedianLift,
    };
  }

  // Coördinaten + terras voor de datum-signalen. Service-role: deze methode
  // draait ook vanuit de cron, die geen user-JWT heeft.
  private async getQuietProfile(businessId: string): Promise<{
    latitude: number | null;
    longitude: number | null;
    hasTerrace: boolean;
  }> {
    try {
      const { data } = await this.supabase.client
        .from('businesses')
        .select('latitude, longitude, has_terrace')
        .eq('id', businessId)
        .maybeSingle();
      const lat = data?.latitude as number | null | undefined;
      const lng = data?.longitude as number | null | undefined;
      return {
        latitude: lat == null ? null : Number(lat),
        longitude: lng == null ? null : Number(lng),
        hasTerrace: (data?.has_terrace as boolean | null) ?? false,
      };
    } catch {
      return { latitude: null, longitude: null, hasTerrace: false };
    }
  }

  /**
   * Datums waarvoor al iets staat, vanaf de maandag van de eerste week in het
   * venster: een concept, een ingeplande of actieve campagne, een al geplaatste
   * (afgeronde) campagne of een openstaand rustig-moment-voorstel.
   *
   * Vanaf de maandag en niet vanaf het venster: het tempo telt alles van die
   * week mee, ook wat al geplaatst is (donderdag met maandag en dinsdag al
   * gedaan telt als twee, niet als nul). Datums vóór het venster zijn zelf
   * geen kandidaat meer; ze tellen alleen mee voor het tempo.
   */
  private async getCoveredDates(
    businessId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Set<string>> {
    const out = new Set<string>();
    const startIso = this.mondayOf(fromIso);
    try {
      const { data } = await this.supabase.client
        .from('campaigns')
        .select('scheduled_for, status')
        .eq('business_id', businessId)
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', `${startIso}T00:00:00Z`)
        .lte('scheduled_for', `${toIso}T23:59:59Z`);
      for (const row of data ?? []) {
        out.add(this.amsterdamDate(new Date(row.scheduled_for as string)));
      }
    } catch (e) {
      this.logger.warn(`campagne-uitsluiting faalde: ${String(e)}`);
    }
    try {
      // Pending voorstellen: er zijn er weinig, dus geen datum-filter in SQL
      // (target_date zit in jsonb).
      const { data } = await this.supabase.client
        .from('ai_suggestions')
        .select('trigger_context')
        .eq('business_id', businessId)
        .eq('status', 'pending');
      for (const row of data ?? []) {
        const ctx = row.trigger_context as { target_date?: string } | null;
        const d = ctx?.target_date;
        if (d && d >= startIso && d <= toIso) out.add(d);
      }
    } catch (e) {
      this.logger.warn(`voorstel-uitsluiting faalde: ${String(e)}`);
    }
    return out;
  }

  /**
   * Recent gebruikte weekdag×dagdeel-slots, voor de cool-down. Key is
   * `weekdag|dagdeel`, of `weekdag|*` als we alleen de weekdag weten.
   *
   * Twee bronnen, bewust ongelijk behandeld:
   *   - ai_suggestions heeft `target_daypart` in trigger_context: dat is het
   *     échte doelmoment, dus een volwaardige treffer.
   *   - campaigns hebben alleen `scheduled_for`, en dat is het VERZEND-moment
   *     (een mail gaat om 10:00 de deur uit voor een diner om 19:00). Daar is
   *     geen dagdeel uit af te leiden, dus die tellen als zwakke, weekdag-only
   *     treffer.
   */
  private async getRecentSlots(
    businessId: string,
    fromIso: string,
  ): Promise<Map<string, SlotUse[]>> {
    const out = new Map<string, SlotUse[]>();
    const baseMonday = this.mondayOf(fromIso);
    const since = new Date(`${baseMonday}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - COOLDOWN_WEEKS * 7);
    const sinceIso = since.toISOString().slice(0, 10);
    // Weekindex t.o.v. de eerste week van het venster; historie is negatief.
    const weekIndexOfDate = (iso: string) =>
      Math.round(
        (Date.parse(`${this.mondayOf(iso)}T12:00:00Z`) -
          Date.parse(`${baseMonday}T12:00:00Z`)) /
          (7 * 86_400_000),
      );
    const add = (key: string, use: SlotUse) => {
      const cur = out.get(key);
      if (cur) cur.push(use);
      else out.set(key, [use]);
    };

    try {
      const { data } = await this.supabase.client
        .from('ai_suggestions')
        .select('trigger_context')
        .eq('business_id', businessId)
        .eq('trigger_type', 'low_occupancy')
        .gte('created_at', `${sinceIso}T00:00:00Z`);
      for (const row of data ?? []) {
        const ctx = row.trigger_context as {
          target_date?: string;
          target_daypart?: string;
        } | null;
        if (!ctx?.target_date || ctx.target_date < sinceIso) continue;
        if (ctx.target_date >= fromIso) continue; // alleen historie
        const weekday = this.mondayIndex(ctx.target_date);
        const weekIndex = weekIndexOfDate(ctx.target_date);
        if (ctx.target_daypart) {
          add(`${weekday}|${normalizeDaypart(ctx.target_daypart)}`, {
            weekIndex,
          });
        } else {
          add(`${weekday}|*`, { weekIndex, weak: true });
        }
      }
    } catch (e) {
      this.logger.warn(`cool-down (voorstellen) faalde: ${String(e)}`);
    }

    try {
      const { data } = await this.supabase.client
        .from('campaigns')
        .select('scheduled_for, status, ai_suggestion_id')
        .eq('business_id', businessId)
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', `${sinceIso}T00:00:00Z`)
        .lt('scheduled_for', `${fromIso}T00:00:00Z`);
      for (const row of data ?? []) {
        if ((row.status as string | null) === 'gearchiveerd') continue;
        // Campagnes mét een suggestie zijn hierboven al geteld op hun échte
        // doel-dagdeel; die niet dubbel meenemen.
        if (row.ai_suggestion_id) continue;
        const date = this.amsterdamDate(new Date(row.scheduled_for as string));
        add(`${this.mondayIndex(date)}|*`, {
          weekIndex: weekIndexOfDate(date),
          weak: true,
        });
      }
    } catch (e) {
      this.logger.warn(`cool-down (campagnes) faalde: ${String(e)}`);
    }
    return out;
  }

  /**
   * De dagdelen waarin de zaak op deze datum OPEN is (uren met patroon > 0,
   * min-dekking), met hun venster. Voor de geleide flow: zodat de eigenaar een
   * ander dagdeel dan het gedetecteerde kan kiezen. Leeg zonder patroon.
   */
  async getDaypartsForDate(
    businessId: string,
    dateIso: string,
  ): Promise<
    { key: string; label: string; fromHour: number; toHour: number }[]
  > {
    const latest = await this.getLatest(businessId);
    if (!latest.pattern || latest.pattern.length < 7) return [];
    const row = latest.pattern[this.mondayIndex(dateIso)] ?? [];
    const out: {
      key: string;
      label: string;
      fromHour: number;
      toHour: number;
    }[] = [];
    for (const dp of DAYPART_DEFS) {
      const hrs: number[] = [];
      for (let h = dp.from; h < dp.to; h++) if ((row[h] ?? 0) > 0) hrs.push(h);
      if (hrs.length < QUIET_PARAMS.minCoverage) continue;
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
  private async getQuietPerWeek(businessId: string): Promise<number> {
    const { data } = await this.supabase.client
      .from('businesses')
      .select('quiet_moments_per_week')
      .eq('id', businessId)
      .maybeSingle();
    const v = data?.quiet_moments_per_week as number | null | undefined;
    return typeof v === 'number' && v >= 1 ? v : QUIET_PARAMS.defaultPerWeek;
  }

  // Tijdvenster (mig 0069) waarbinnen voorstellen mogen vallen. Beide kolommen
  // leeg → null (geen beperking). Alleen een geldig venster (start < end)
  // telt; anders vallen we terug op geen beperking.
  private async getQuietWindow(
    businessId: string,
  ): Promise<{ start: number; end: number } | null> {
    const { data } = await this.supabase.client
      .from('businesses')
      .select('quiet_window_start_hour, quiet_window_end_hour')
      .eq('id', businessId)
      .maybeSingle();
    const s = data?.quiet_window_start_hour as number | null | undefined;
    const e = data?.quiet_window_end_hour as number | null | undefined;
    if (typeof s === 'number' && typeof e === 'number' && s < e) {
      return { start: s, end: e };
    }
    return null;
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
  /**
   * Bezettingsrapportage: wat de metingen zeggen over een langere periode,
   * en hoe dat zich verhoudt tot het Google-weekpatroon.
   *
   * Twee dingen uit één scan, want ze delen dezelfde bron:
   *   1. `hourly`  — gemeten drukte per (weekdag, uur). Per datum-uur eerst
   *      de mediaan van de metingen, dan de mediaan over de datums. Cellen
   *      met te weinig gemeten dagen blijven null: liever een leeg vakje dan
   *      een getal op één waarneming.
   *   2. `dayparts` — verwacht naast werkelijk per (weekdag, dagdeel).
   *
   * Cruciaal bij (2): de verwachting rekenen we over PRECIES dezelfde uren
   * die we ook gemeten hebben. Anders vergelijk je een dagdeel waarvan je
   * twee uur meet met een verwachting over vier uur, en is het verschil een
   * rekenfout in plaats van een bevinding.
   *
   * Beide maten zijn relatief: Google normaliseert op de eigen piek van de
   * zaak (drukste moment = 100). Het is dus geen bezettingspercentage van de
   * stoelen, en niet vergelijkbaar tussen zaken.
   */
  async getOccupancyReport(
    businessId: string,
    weeks = 16,
  ): Promise<{
    hasSource: boolean;
    weeks: number;
    /** Aantal dagen dat een cel minstens moet hebben om te tellen. */
    minDays: number;
    hourly: OccupancyHourly[];
    dayparts: OccupancyDaypart[];
  }> {
    const MIN_DAYS = 3;
    const empty = {
      hasSource: false,
      weeks,
      minDays: MIN_DAYS,
      hourly: [],
      dayparts: [],
    };

    const latest = await this.getLatest(businessId);
    const pattern = latest.pattern;

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - weeks * 7);
    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('captured_at, live_pct, live_hour')
      .eq('business_id', businessId)
      .not('live_pct', 'is', null)
      .gte('captured_at', since.toISOString());
    if (error) {
      this.logger.warn(`bezettingsrapportage faalde: ${error.message}`);
      return empty;
    }

    const { hourly, dayparts } = aggregateOccupancyReport(
      (data ?? []) as LiveRow[],
      pattern,
      MIN_DAYS,
    );
    if (hourly.length === 0) return empty;

    return { hasSource: true, weeks, minDays: MIN_DAYS, hourly, dayparts };
  }

  async getActualByDate(
    businessId: string,
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
      .eq('business_id', businessId)
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
      .from('businesses')
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
          businessId: r.id as string,
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
      .from('businesses')
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

    // Maandoverzicht wegschrijven VÓÓR de prune (mig 0075). De volgorde is
    // de hele reden dat die tabel bestaat: prunen we eerst, dan is de bron
    // weg en is die maand voorgoed onherleidbaar.
    const rollup = await this.rollupMonthly().catch((e) => {
      this.logger.error(`Maandoverzicht faalde volledig: ${String(e)}`);
      return null;
    });

    // Oude snapshots opruimen (de wekelijkse refresh is een mooi moment).
    // Live-metingen > 120 dagen zijn ruim voldoende voor de mediaan-per-
    // weekdag; oudere rijen (incl. verouderde patronen) mogen weg.
    //
    // Maar alleen als het maandoverzicht gelukt is. Ging daar iets mis, dan
    // slaan we de prune over: ruwe data die we nog hebben is altijd beter
    // dan een gat in de historie. De volgende wekelijkse run probeert het
    // opnieuw, en omdat de rollup het hele venster pakt haalt 'ie de
    // overgeslagen maand vanzelf in.
    // Hetzelfde geldt voor het dagoverzicht (mig 0079).
    const daily = await this.rollupDaily().catch((e) => {
      this.logger.error(`Dagoverzicht faalde volledig: ${String(e)}`);
      return null;
    });

    let pruned = 0;
    if (rollup && rollup.failed === 0 && daily && daily.failed === 0) {
      pruned = await this.pruneOldSnapshots().catch((e) => {
        this.logger.warn(`Prune faalde: ${String(e)}`);
        return 0;
      });
    } else {
      this.logger.warn(
        'Prune overgeslagen: het maand- of dagoverzicht is niet voor alle zaken gelukt.',
      );
    }

    return { total: targets.length, refreshed, pruned, results };
  }

  /**
   * Schrijft het maandoverzicht weg voor alle zaken met live-metingen in het
   * retentievenster. Moet VÓÓR pruneOldSnapshots draaien, anders is de bron
   * al weg — dat is de hele reden dat deze tabel bestaat.
   *
   * Idempotent: upsert op (business_id, month, weekday, hour), dus een maand
   * die nog loopt wordt bij elke run bijgewerkt en een afgesloten maand
   * blijft staan zoals hij was.
   *
   * Fail-soft per zaak: één kapotte rollup mag de rest niet blokkeren. Maar
   * het totaalresultaat meldt wél of er iets misging, want de caller gebruikt
   * dat om te beslissen of prunen veilig is.
   */
  async rollupMonthly(): Promise<{
    businesses: number;
    rows: number;
    failed: number;
  }> {
    const { data, error } = await this.supabase.client
      .from('businesses')
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    const ids = ((data ?? []) as Array<{ id: string }>).map((b) => b.id);

    let rows = 0;
    let failed = 0;
    let touched = 0;
    for (const businessId of ids) {
      try {
        const n = await this.rollupMonthlyFor(businessId);
        if (n > 0) touched += 1;
        rows += n;
      } catch (e) {
        failed += 1;
        this.logger.error(
          `maandoverzicht faalde voor ${businessId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    this.logger.log(
      `maandoverzicht: ${rows} rijen voor ${touched} zaken, ${failed} mislukt.`,
    );
    return { businesses: touched, rows, failed };
  }

  /** Maandoverzicht voor één zaak. Retourneert het aantal weggeschreven rijen. */
  private async rollupMonthlyFor(businessId: string): Promise<number> {
    // Het hele retentievenster meenemen, niet alleen de vorige maand: zo
    // repareert een run die een keer overgeslagen is zichzelf, en wordt de
    // lopende maand steeds bijgewerkt.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - MONTHLY_LOOKBACK_DAYS);

    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('captured_at, live_pct, live_hour')
      .eq('business_id', businessId)
      .not('live_pct', 'is', null)
      .gte('captured_at', since.toISOString());
    if (error) throw new InternalServerErrorException(error.message);
    const metingen = (data ?? []) as LiveRow[];
    if (metingen.length === 0) return 0;

    const latest = await this.getLatest(businessId);
    const cells = aggregateMonthly(metingen, latest.pattern);
    if (cells.length === 0) return 0;

    const payload = cells.map((c) => ({
      business_id: businessId,
      month: c.month,
      weekday: c.weekday,
      hour: c.hour,
      actual_pct: c.actualPct,
      expected_pct: c.expectedPct,
      days: c.days,
      updated_at: new Date().toISOString(),
    }));
    const { error: upErr } = await this.supabase.client
      .from('busyness_monthly')
      .upsert(payload, { onConflict: 'business_id,month,weekday,hour' });
    if (upErr) throw new InternalServerErrorException(upErr.message);
    return payload.length;
  }

  /**
   * Dagoverzicht (mig 0079): per zaak, datum en uur de gemeten drukte, plus
   * per datum de omstandigheden. Draait dagelijks (zodat een dag direct
   * bewaard is) en nogmaals vóór de wekelijkse prune. Idempotent en
   * zelfherstellend: elke run neemt het hele retentievenster mee.
   */
  async rollupDaily(): Promise<{
    businesses: number;
    rows: number;
    failed: number;
  }> {
    const { data, error } = await this.supabase.client
      .from('businesses')
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    const ids = ((data ?? []) as Array<{ id: string }>).map((b) => b.id);

    let rows = 0;
    let failed = 0;
    let touched = 0;
    for (const businessId of ids) {
      try {
        const n = await this.rollupDailyFor(businessId);
        if (n > 0) touched += 1;
        rows += n;
      } catch (e) {
        failed += 1;
        this.logger.error(
          `dagoverzicht faalde voor ${businessId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    this.logger.log(
      `dagoverzicht: ${rows} rijen voor ${touched} zaken, ${failed} mislukt.`,
    );
    return { businesses: touched, rows, failed };
  }

  private async rollupDailyFor(businessId: string): Promise<number> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - DAILY_LOOKBACK_DAYS);

    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('captured_at, live_pct, live_hour')
      .eq('business_id', businessId)
      .not('live_pct', 'is', null)
      .gte('captured_at', since.toISOString());
    if (error) throw new InternalServerErrorException(error.message);
    const metingen = (data ?? []) as LiveRow[];
    if (metingen.length === 0) return 0;

    const latest = await this.getLatest(businessId);
    const cells = aggregateDaily(metingen, latest.pattern);
    if (cells.length === 0) return 0;

    const now = new Date().toISOString();
    const payload = cells.map((c) => ({
      business_id: businessId,
      day: c.day,
      weekday: c.weekday,
      hour: c.hour,
      actual_pct: c.actualPct,
      expected_pct: c.expectedPct,
      measurements: c.measurements,
      updated_at: now,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error: upErr } = await this.supabase.client
        .from('busyness_daily')
        .upsert(payload.slice(i, i + 500), {
          onConflict: 'business_id,day,hour',
        });
      if (upErr) throw new InternalServerErrorException(upErr.message);
    }

    // De omstandigheden zijn secundair aan de drukte zelf: mislukt dat, dan
    // blijft de drukte bewaard en probeert de volgende run het opnieuw.
    await this.rollupDayContextFor(
      businessId,
      [...new Set(cells.map((c) => c.day))].sort(),
    ).catch((e) =>
      this.logger.warn(
        `dagcontext faalde voor ${businessId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ),
    );
    return payload.length;
  }

  /** Weer, feestdag en evenementen per gemeten datum bewaren. */
  private async rollupDayContextFor(
    businessId: string,
    days: string[],
  ): Promise<void> {
    if (days.length === 0) return;
    const first = days[0];
    const last = days[days.length - 1];

    const { data: biz } = await this.supabase.client
      .from('businesses')
      .select('latitude, longitude')
      .eq('id', businessId)
      .maybeSingle();
    const lat = biz?.latitude as number | null | undefined;
    const lng = biz?.longitude as number | null | undefined;

    // Wat er al staat: gevuld weer blijft staan, ontbrekend weer proberen we opnieuw.
    const { data: existing } = await this.supabase.client
      .from('busyness_day_context')
      .select('day, weather_code, temp_max, temp_min, weather_hourly')
      .eq('business_id', businessId)
      .gte('day', first)
      .lte('day', last);
    const weather = new Map<
      string,
      { code: number; tempMax: number; tempMin: number }
    >();
    const hourly = new Map<string, HourlyWeather>();
    for (const r of (existing ?? []) as Array<{
      day: string;
      weather_code: number | null;
      temp_max: number | null;
      temp_min: number | null;
      weather_hourly: {
        temp: (number | null)[];
        code: (number | null)[];
      } | null;
    }>) {
      if (r.weather_hourly) {
        const nan = (a: (number | null)[]) => a.map((v) => v ?? NaN);
        hourly.set(r.day, {
          temp: nan(r.weather_hourly.temp),
          code: nan(r.weather_hourly.code),
        });
      }
      if (r.weather_code != null && r.temp_max != null && r.temp_min != null) {
        weather.set(r.day, {
          code: r.weather_code,
          tempMax: Number(r.temp_max),
          tempMin: Number(r.temp_min),
        });
      }
    }

    const missing = days.filter((d) => !weather.has(d));
    if (missing.length > 0 && lat != null && lng != null) {
      const ageDays = Math.ceil(
        (Date.now() - Date.parse(`${missing[0]}T00:00:00Z`)) / 86_400_000,
      );
      if (ageDays <= 92) {
        const history = await this.openMeteo
          .getHistory(lat, lng, ageDays + 1)
          .catch(() => []);
        for (const h of history) {
          if (missing.includes(h.date)) {
            weather.set(h.date, {
              code: h.code,
              tempMax: h.tempMax,
              tempMin: h.tempMin,
            });
          }
        }
      }
    }

    // Het weer per uur, voor de dagen waar het nog ontbreekt.
    const missingHourly = days.filter((d) => !hourly.has(d));
    if (missingHourly.length > 0 && lat != null && lng != null) {
      const ageDays = Math.ceil(
        (Date.now() - Date.parse(`${missingHourly[0]}T00:00:00Z`)) / 86_400_000,
      );
      if (ageDays <= 92) {
        const history = await this.openMeteo
          .getHourlyHistory(lat, lng, ageDays + 1)
          .catch(() => new Map<string, HourlyWeather>());
        for (const [date, h] of history) {
          if (missingHourly.includes(date)) hourly.set(date, h);
        }
      }
    }

    const holidays = new Map<string, string>();
    const years = new Set(days.map((d) => Number(d.slice(0, 4))));
    for (const y of years) {
      for (const h of getNlHolidays(y)) holidays.set(h.date, h.name);
    }

    const events = new Map<
      string,
      { name: string; category: string; distanceKm: number }[]
    >();
    const nearby = await this.events
      .findNearbyInRange(businessId, first, last, 2000)
      .catch(() => []);
    for (const e of nearby) {
      const arr = events.get(e.startsOn) ?? [];
      arr.push({
        name: e.name,
        category: e.category,
        distanceKm: e.distanceKm,
      });
      events.set(e.startsOn, arr);
    }

    const now = new Date().toISOString();
    const payload = buildDayContext(
      days,
      weather,
      holidays,
      events,
      hourly,
    ).map((r) => ({
      business_id: businessId,
      day: r.day,
      weekday: r.weekday,
      weather_code: r.weatherCode,
      temp_max: r.tempMax,
      temp_min: r.tempMin,
      holiday: r.holiday,
      weather_hourly: r.weatherHourly,
      events: r.events,
      updated_at: now,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await this.supabase.client
        .from('busyness_day_context')
        .upsert(payload.slice(i, i + 500), { onConflict: 'business_id,day' });
      if (error) throw new InternalServerErrorException(error.message);
    }
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
