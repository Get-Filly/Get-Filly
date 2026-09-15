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
import {
  cooldownFactor,
  dateBusynessFactor,
  INCIDENTAL_MIN_DAMP,
  COOLDOWN_WEEKS,
  SAME_WEEK_DAYPART_DAMP,
  type DateSignals,
  type EventSignal,
  type QuietNote,
  type QuietReason,
  type SlotHit,
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
  daypart: string; // ochtend|lunch|middag|diner|avond
  daypartLabel: string; // 'middag'
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
// ------------------------------------------------------------
// Model = VULBAARHEID-FIRST (2026-08-06). Hoofdmaat is de `gap`: hoeveel
// een dagdeel structureel onder de eigen piek zit = hoeveel er te vullen is.
// De anomalie (median-polish-restant t.o.v. wat dat weekdag×dagdeel normaal
// doet) is GEEN poort meer maar een RANKING-BONUS + het 'ongewoon rustig'-
// label. Zo komen structureel-lege dagen (ma/di) — je beste campagne-targets
// — weer bovendrijven, terwijl een verrassende dip alsnog extra omhoog scoort.
// (Voorheen was het pure anomalie-detectie, die juist die structureel-lege
// dagen wegfilterde als "geen afwijking, dus geen kans".)
const MIN_COVERAGE = 2; // min. open uren voordat een dagdeel meetelt
const GAP_FLOOR = 15; // min. vulbaarheid: punten onder de eigen piek (hoofd-relevantiepoort)
const EDGE_ACTIVITY_FRAC = 0.3; // het eerste/laatste open dagdeel (opening/afsluiting) telt alleen mee als het ≥ dit deel van de eigen piek is; anders is het de dode rand van de shift. Tussenliggende dagdelen (bv. een rustige middag) hebben deze drempel niet.
const ABS_DEV_FLOOR = 2; // ondergrens (punten) voor vlakke zaken waar de schommeling ~0 is
const ANOMALY_WEIGHT = 0.5; // hoe zwaar een 'ongewoon rustig'-afwijking maximaal meeweegt bovenop de vulbaarheid in de ranking
const UNUSUAL_SPREAD_MULT = 2.0; // label 'ongewoon rustig' vanaf deze afwijking (× normale schommeling)
const DEFAULT_QUIET_PER_WEEK = 2; // tempo: max rustige momenten per week (instelbaar per zaak)

// Staffel per event-categorie, gespiegeld aan EventsService: hier alleen als
// SCHAAL om nabijheid op te wegen (een festival op 9 van de 10 km weegt licht,
// een kermis op 0,2 van de 2 km zwaar). De filtering op afstand heeft
// findNearbyInRange al gedaan.
const STAFFEL_KM: Record<string, number> = {
  kermis: 2,
  markten: 2,
  concerten_theater: 5,
  sportevenementen: 5,
  events: 5,
  festivals: 10,
};

// Eén gebruik van een weekdag×dagdeel-slot, voor de cool-down. `weekIndex` is
// de week t.o.v. de eerste week van het opgevraagde venster (historie is dus
// negatief); `weak` = we kennen alleen de weekdag, niet het dagdeel.
type SlotUse = { weekIndex: number; weak?: boolean };

// Alles wat per kalenderdatum verschilt, in één keer geladen voor het venster.
type QuietContext = {
  holidayByDate: Map<string, string>;
  eventsByDate: Map<string, EventSignal[]>;
  weatherByDate: Map<string, WeatherSignal>;
  hasTerrace: boolean;
  covered: Set<string>;
  recentSlots: Map<string, SlotUse[]>;
};

// Lege context = geen enkel datum-signaal en geen beleid: het model draait dan
// op het patroon alleen, precies zoals vóór 2026-09-15. Dit is ook de fallback
// als elke bron wegvalt.
const EMPTY_QUIET_CONTEXT: QuietContext = {
  holidayByDate: new Map(),
  eventsByDate: new Map(),
  weatherByDate: new Map(),
  hasTerrace: false,
  covered: new Set(),
  recentSlots: new Map(),
};

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
   * Rustige momenten per dagdeel, voorspellend, voor een datumbereik. Rekenwijze:
   *   1. Dagdeel-rooster: gemiddelde drukte per open uur, per (weekdag, dagdeel),
   *      op vaste vensters, bijgesneden op de open uren (min-dekking).
   *   2. Robuuste two-way ontleding (median polish): verwacht niveau per cel =
   *      overall + weekdag-effect + dagdeel-effect (medianen, dus ongevoelig voor
   *      uitschieters die anders hun eigen baseline zouden vervuilen).
   *   3. DATUM-SIGNALEN (2026-09-15): weer en evenementen schuiven de verwachte
   *      drukte per KALENDERDATUM. Dit gebeurt bewust vóór de gap-poort. Zou de
   *      factor pas op de eindscore werken, dan kan hij alleen herschikken en
   *      nooit een kans laten ontstaan; nu komt een vrijdag met te weinig gat
   *      alsnog boven de drempel als er storm staat. Hierdoor is de score geen
   *      constante per weekdag meer — dát is de eigenlijke oplossing voor het
   *      "elke week dezelfde weekdagen"-probleem.
   *   4. Afwijking = werkelijk − verwacht (het residu, inclusief de datum-schuif),
   *      met robuuste MAD als maat voor de normale schommeling. VULBAARHEID-FIRST:
   *      de afwijking is geen poort maar een ranking-bonus + het 'ongewoon
   *      rustig'-label.
   *   5. Kandidaat = vulbaar: gat t.o.v. de eigen piek ≥ GAP_FLOOR. Ook een
   *      structureel-leeg-maar-"normaal" dagdeel telt dus mee. Het eerste/
   *      laatste open dagdeel (de rand van de shift) valt af als het doods is
   *      (< EDGE_ACTIVITY_FRAC × piek); tussenliggende dagdelen niet.
   *   6. Aaneengesloten rustige dagdelen op één dag = één kans (bv. diner +
   *      avond); max één kans per dag.
   *   7. BELEIDSLAAG (2026-09-15): harde poorten (feestdag, datum al afgedekt
   *      door een concept/campagne/voorstel) en demping (cool-down op recent
   *      gebruikte weekdag×dagdeel-slots + spreiding over dagdelen binnen een
   *      week). Daarna cappen op `perWeek` DAGEN per week.
   *
   * `opts.applyPolicy = false` slaat stap 3 en 7 volledig over en geeft het
   * kale patroon-model terug. Nodig voor de aanroepers die vragen "wélk dagdeel
   * is rustig op déze datum" voor een dag die de eigenaar zélf koos (de geleide
   * flow): daar mag een feestdag of een al afgedekte dag het dagdeel niet
   * wegfilteren.
   *
   * Fail-soft: valt een signaalbron weg (weer, events, of de DB-lezingen voor
   * de beleidslaag), dan draait het model door op het patroon alleen. Dat pad
   * loopt sowieso elke aanroep mee: voorbij dag 7 is er geen weerverwachting.
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
    opts?: { applyPolicy?: boolean },
  ): Promise<QuietMomentsResult> {
    const applyPolicy = opts?.applyPolicy ?? true;
    const latest = await this.getLatest(businessId);
    if (!latest.pattern || latest.pattern.length < 7) {
      return { hasSource: false, moments: [], notes: [] };
    }
    const pattern = latest.pattern;
    const effectivePerWeek =
      perWeek ?? (await this.getQuietPerWeek(businessId));
    // Tijdvenster (mig 0069): null = geen beperking (hele open dag). Anders
    // [startUur, eindUur) — een dagdeel telt alleen mee als het genoeg open
    // uren binnen dit venster heeft.
    const win = await this.getQuietWindow(businessId);

    // Datum-signalen + beleids-historie. Alles fail-soft; een lege context
    // levert exact het oude gedrag op.
    const ctx = applyPolicy
      ? await this.loadQuietContext(businessId, fromIso, toIso)
      : EMPTY_QUIET_CONTEXT;

    // 1. Dagdeel-rooster. cel = gemiddelde drukte per open uur; null = onder
    //    min-dekking → telt niet mee. from/to = het open-uur-venster (voor de
    //    rustig-band op de grafiek).
    type Cell = { avg: number; from: number; to: number };
    const cells: (Cell | null)[][] = pattern.map((row) =>
      DAYPART_DEFS.map((dp) => {
        const hrs: number[] = [];
        for (let h = dp.from; h < dp.to; h++)
          if ((row[h] ?? 0) > 0) hrs.push(h);
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

    // Piek (drukste dagdeel) + alle residu-waarden voor de schommeling. De piek
    // blijft STRUCTUREEL (onaangeraakt door datum-signalen): het is "hoe vol kan
    // deze zaak worden", en dat verandert niet door het weer van volgende week.
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
    if (!resVals.length || !peak) {
      return { hasSource: true, moments: [], notes: [] };
    }

    // 3. Normale schommeling = robuuste MAD (mediane absolute afwijking t.o.v. de
    //    mediaan), op std-schaal gebracht (×1,4826). Deze `spread` gebruiken we
    //    NIET als poort (dat filterde structureel-lege dagen weg), maar (a) om de
    //    anomalie-bonus te normaliseren en (b) voor het 'ongewoon rustig'-label
    //    vanaf UNUSUAL_SPREAD_MULT × de schommeling. ABS_DEV_FLOOR vangt vlakke
    //    zaken waar de schommeling ~0 is.
    const medRes = this.medianExact(resVals);
    const mad = this.medianExact(resVals.map((r) => Math.abs(r - medRes)));
    const spread = 1.4826 * mad || 1;
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
    const dateReason = new Map<string, QuietReason | null>();
    const dateFactor = new Map<string, number>();
    const notes: QuietNote[] = [];

    for (const date of this.eachDate(fromIso, toIso)) {
      // Harde poort 1: feestdag. Een feestdag is geen rustig moment om te
      // vullen — niet de stille (Goede Vrijdag) en niet de drukke (Kerst,
      // Valentijn). Bewust NIET gekoppeld aan `event_holidays_enabled`
      // (mig 0055): die voorkeur gaat over feestdag-PROMOTIES, en wie die
      // uitzet wil al helemaal geen "kerst is rustig, doe een actie".
      const holiday = ctx.holidayByDate.get(date);
      if (holiday) {
        notes.push({ date, reason: 'feestdag', label: holiday });
        continue;
      }
      // Harde poort 2: er staat al een concept, campagne of voorstel voor
      // deze dag. Dit gebeurt vóór de week-cap, anders vreet een afgedekte
      // dag een van de weekplekken op en schuift er niets voor in de plaats
      // (dat was de situatie tot 2026-09-15: afdekken maakte de lijst korter
      // in plaats van anders).
      if (ctx.covered.has(date)) {
        notes.push({ date, reason: 'al_afgedekt' });
        continue;
      }

      const weekday = this.mondayIndex(date);
      // Datum-signalen → drukte-factor. >1 = drukker dan het patroon zegt.
      const signals: DateSignals = {
        weather: ctx.weatherByDate.get(date) ?? null,
        events: ctx.eventsByDate.get(date) ?? [],
      };
      const { factor, reason } = applyPolicy
        ? dateBusynessFactor(signals, ctx.hasTerrace)
        : { factor: 1, reason: null };
      dateFactor.set(date, factor);
      dateReason.set(date, reason);

      // Eerste/laatste open dagdeel = de rand van de shift (opening/afsluiting).
      const openIdx = cells[weekday]
        .map((c, j) => (c ? j : -1))
        .filter((j) => j >= 0);
      const firstIdx = openIdx[0];
      const lastIdx = openIdx[openIdx.length - 1];
      const arr: PartCand[] = [];
      DAYPART_DEFS.forEach((dp, j) => {
        const c = cells[weekday][j];
        const baseDev = residual[weekday][j];
        if (!c || baseDev == null) return;
        // Rand van de shift (opening/afsluiting): alleen meenemen als er echt
        // iets te vullen is. Een doods eerste/laatste dagdeel is logisch rustig
        // maar geen kans. Deze toets blijft op de STRUCTURELE waarde: regen
        // hoort een dode ochtend niet tot kans te promoveren.
        const isEdge = j === firstIdx || j === lastIdx;
        if (isEdge && c.avg < EDGE_ACTIVITY_FRAC * peak) return;

        // Datum-schuif op de verwachte drukte. De schuif telt óók mee als
        // afwijking, zodat een regendag vanzelf 'ongewoon rustig' wordt en de
        // bestaande chat-toon klopt.
        const adjusted = Math.max(0, Math.min(100, c.avg * factor));
        const dev = baseDev + (adjusted - c.avg);
        const gap = peak - adjusted;
        if (gap < GAP_FLOOR) return; // te weinig te vullen (hoofd-relevantiepoort)
        // GEEN anomalie-poort: ook een structureel-leeg (maar "normaal" rustig)
        // dagdeel is een vulbare kans. De afwijking weegt alleen mee in de
        // ranking + bepaalt het 'ongewoon rustig'-label.
        //
        // Tijdvenster (mig 0069): is er een venster ingesteld, dan telt dit
        // dagdeel alleen mee als het ≥ MIN_COVERAGE open uren bínnen het venster
        // heeft. Het getoonde venster (from/to) knippen we bij op het venster,
        // zodat de eigenaar geen tijd buiten z'n keuze te zien krijgt.
        let from = c.from;
        let to = c.to;
        if (win) {
          const inWin: number[] = [];
          for (let h = dp.from; h < dp.to; h++) {
            if (
              (pattern[weekday][h] ?? 0) > 0 &&
              h >= win.start &&
              h < win.end
            ) {
              inWin.push(h);
            }
          }
          if (inWin.length < MIN_COVERAGE) return; // dagdeel valt buiten het venster
          from = inWin[0];
          to = inWin[inWin.length - 1];
        }
        arr.push({
          j,
          label: dp.label,
          key: dp.key,
          dev,
          gap,
          from,
          to,
          expectedPct: adjusted,
        });
      });
      if (arr.length) perDate.set(date, arr);
    }

    // 5. Per dag: aaneengesloten dagdelen (opeenvolgende j) samenvoegen tot één
    //    kans (bv. diner + avond = één rustig blok). De sterkste aaneengesloten
    //    reeks is dé kans van die dag → max één kans per dag.
    type Kans = QuietMoment & { score: number; week: string };
    // Vulbaarheid-first: gap/peak (0..~1) is de hoofdmaat; een negatieve
    // afwijking (rustiger dan verwacht) geeft een bonus zodat verrassende
    // dips bovenop even-lege-maar-normale slots uitkomen. Een positieve
    // afwijking straft niet (structureel-leeg blijft een volwaardige kans).
    //
    // De anomalie-bonus is BEGRENSD op ANOMALY_WEIGHT (2026-09-15). Zonder die
    // begrenzing loopt hij weg zodra de residu-verdeling vlak is: `spread` valt
    // dan terug op 1 en een afwijking van 35 punten levert een bonus van 17,5
    // tegenover een vulbaarheidsterm van hooguit 1. De vulbaarheid, die de
    // hoofdmaat hoort te zijn, verdween daarmee in de ruis, en elke factor op
    // de score (cool-down, spreiding) werd betekenisloos. Ook `spread` zelf
    // krijgt nu ABS_DEV_FLOOR als ondergrens, dezelfde bodem die het 'ongewoon
    // rustig'-label al gebruikt. Score blijft zo binnen 0..1 + ANOMALY_WEIGHT.
    const devScale = Math.max(spread, ABS_DEV_FLOOR);
    const runScore = (run: PartCand[]) =>
      Math.max(
        ...run.map(
          (p) =>
            p.gap / (peak || 1) +
            ANOMALY_WEIGHT * Math.min(1, Math.max(0, -p.dev) / devScale),
        ),
      );
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
      const unusual = devMin <= unusualThreshold;
      const factor = dateFactor.get(date) ?? 1;
      // Incidenteel = juist déze datum is rustiger dan het weekpatroon zegt.
      // Een datum die door een event juist drúkker is, is niet incidenteel —
      // die zakt gewoon in de ranking.
      const kind: 'structureel' | 'incidenteel' =
        factor <= 1 - INCIDENTAL_MIN_DAMP ? 'incidenteel' : 'structureel';
      const signalReason = dateReason.get(date) ?? null;
      const reason: QuietReason =
        kind === 'incidenteel' && signalReason
          ? signalReason
          : signalReason?.reasonKey === 'eventNearby'
            ? signalReason
            : {
                reasonKey: unusual ? 'unusual' : 'structural',
                reasonParams: {},
              };
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
        unusual,
        fromHour: Math.min(...best.map((p) => p.from)),
        toHour: Math.max(...best.map((p) => p.to)),
        kind,
        reasonKey: reason.reasonKey,
        reasonParams: reason.reasonParams,
        score: runScore(best),
        week: this.mondayOf(date),
      });
    }

    // 6. Selectie. Zonder beleidslaag: het oude gedrag (sorteer op score, cap
    //    per week). Met beleidslaag: greedy per week in DATUMVOLGORDE, waarbij
    //    elke pick als cool-down-treffer terugschrijft voor de weken erna.
    //    Dat vooruit-werkende deel is wat een stateless GET over een rollend
    //    venster laat rouleren: op historie alleen verandert er niets zolang
    //    de eigenaar nog nergens op geklikt heeft.
    const picked = applyPolicy
      ? this.pickWithPolicy(dayKansen, effectivePerWeek, fromIso, ctx)
      : this.pickByScore(dayKansen, effectivePerWeek);

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
      kind: k.kind,
      reasonKey: k.reasonKey,
      reasonParams: k.reasonParams,
    }));
    return { hasSource: true, moments, notes };
  }

  // Oude selectie: sorteren op score, cappen op het aantal DAGEN per week.
  private pickByScore<T extends QuietMoment & { score: number; week: string }>(
    kansen: T[],
    perWeek: number,
  ): T[] {
    const sorted = [...kansen].sort((a, b) => b.score - a.score);
    const perWeekCount = new Map<string, number>();
    const out: T[] = [];
    for (const k of sorted) {
      if ((perWeekCount.get(k.week) ?? 0) >= perWeek) continue;
      perWeekCount.set(k.week, (perWeekCount.get(k.week) ?? 0) + 1);
      out.push(k);
    }
    return out;
  }

  /**
   * Selectie mét beleidslaag: per week greedy kiezen, met cool-down op recent
   * gebruikte weekdag×dagdeel-slots en een milde spreiding over dagdelen
   * binnen dezelfde week.
   *
   * Belangrijk: demping VERWIJDERT nooit. Is elke kandidaat gedempt, dan
   * wordt er nog steeds tot `perWeek` gevuld en valt de rangorde terug op de
   * basisscore — je krijgt dus nooit mínder momenten dan het oude model. Een
   * week kan alleen leeg raken door de harde poorten (feestdag, al afgedekt),
   * en die dagen staan dan in `notes`.
   */
  private pickWithPolicy<
    T extends QuietMoment & { score: number; week: string },
  >(kansen: T[], perWeek: number, fromIso: string, ctx: QuietContext): T[] {
    // Weeksleutel → weekindex t.o.v. de eerste week in het venster. Historische
    // treffers krijgen een negatieve index, zodat weeksAgo altijd ≥ 0 uitkomt.
    const baseMonday = this.mondayOf(fromIso);
    const weekIndexOf = (monday: string) =>
      Math.round(
        (Date.parse(`${monday}T12:00:00Z`) -
          Date.parse(`${baseMonday}T12:00:00Z`)) /
          (7 * 86_400_000),
      );

    // Lopende historie: begint bij wat er in de DB staat, groeit met elke pick.
    const hits = new Map<string, SlotUse[]>(
      [...ctx.recentSlots].map(([k, v]) => [k, [...v]]),
    );
    const push = (key: string, use: SlotUse) => {
      const cur = hits.get(key);
      if (cur) cur.push(use);
      else hits.set(key, [use]);
    };
    const slotKey = (weekday: number, daypart: string) =>
      `${weekday}|${daypart}`;
    const dayKey = (weekday: number) => `${weekday}|*`;

    const byWeek = new Map<string, T[]>();
    for (const k of kansen) {
      const arr = byWeek.get(k.week);
      if (arr) arr.push(k);
      else byWeek.set(k.week, [k]);
    }
    const weeks = [...byWeek.keys()].sort();

    const out: T[] = [];
    for (const week of weeks) {
      const wi = weekIndexOf(week);
      const remaining = [...(byWeek.get(week) ?? [])];
      const pickedDayparts = new Set<string>();

      for (let n = 0; n < perWeek && remaining.length > 0; n++) {
        let bestIdx = -1;
        let bestScore = -Infinity;
        let bestFactor = 1;
        let anyDamped = false;

        remaining.forEach((k, idx) => {
          const uses: SlotHit[] = [
            ...(hits.get(slotKey(k.weekday, k.daypart)) ?? []),
            ...(hits.get(dayKey(k.weekday)) ?? []),
          ].map((u) => ({ weeksAgo: wi - u.weekIndex, weak: u.weak }));
          let factor = cooldownFactor(uses);
          // Spreiding: een tweede kans in dezelfde week met hetzelfde dagdeel
          // is minder waard. Dempen, niet forceren — anders is het weer een
          // regel die een vast patroon oplevert. (Verschillende weekdagen
          // hoeven we niet af te dwingen: er is al max één kans per dag.)
          if (pickedDayparts.has(k.daypart)) factor *= SAME_WEEK_DAYPART_DAMP;

          if (factor < 1) anyDamped = true;
          const score = k.score * factor;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
            bestFactor = factor;
          }
        });

        if (bestIdx < 0) break;
        const chosen = remaining.splice(bestIdx, 1)[0];
        // Gekozen terwijl een ánder slot gedempt was: dan is "het gebruikelijke
        // moment hebben we recent al gedaan" de eerlijke uitleg voor waarom
        // juist deze dag, en niet alleen "doorgaans rustig".
        if (anyDamped && bestFactor >= 1 && chosen.reasonKey === 'structural') {
          chosen.reasonKey = 'structuralRotated';
        }
        out.push(chosen);
        pickedDayparts.add(chosen.daypart);
        // Terugschrijven als gebruik in DEZE week, zodat de weken erna 'm
        // gedempt zien. Dit vooruit-werkende deel is wat een stateless GET
        // over een rollend venster laat rouleren.
        push(slotKey(chosen.weekday, chosen.daypart), { weekIndex: wi });
      }
    }
    return out;
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
    const holidayByDate = new Map<string, string>();
    const years = new Set<number>([
      Number(fromIso.slice(0, 4)),
      Number(toIso.slice(0, 4)),
    ]);
    for (const y of years) {
      if (!Number.isFinite(y)) continue;
      for (const h of getNlHolidays(y)) {
        if (h.date >= fromIso && h.date <= toIso)
          holidayByDate.set(h.date, h.name);
      }
    }

    const [profile, covered, recentSlots, events] = await Promise.all([
      this.getQuietProfile(businessId),
      this.getCoveredDates(businessId, fromIso, toIso),
      this.getRecentSlots(businessId, fromIso),
      this.events.findNearbyInRange(businessId, fromIso, toIso).catch((e) => {
        this.logger.warn(`events-signaal faalde: ${String(e)}`);
        return [] as Awaited<ReturnType<EventsService['findNearbyInRange']>>;
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
        radiusKm: STAFFEL_KM[e.category] ?? 5,
      };
      if (arr) arr.push(signal);
      else eventsByDate.set(e.startsOn, [signal]);
    }

    // Weer: alleen zinvol binnen de 7-daagse Open-Meteo-horizon. Daarbuiten
    // geen entry → factor 1. Dat is hetzelfde codepad als "weerbron weg", dus
    // die fallback loopt elke aanroep sowieso mee.
    const weatherByDate = new Map<string, WeatherSignal>();
    if (profile.latitude != null && profile.longitude != null) {
      const forecast = await this.openMeteo.getForecastSafe(
        profile.latitude,
        profile.longitude,
      );
      for (const d of forecast) {
        if (d.date < fromIso || d.date > toIso) continue;
        weatherByDate.set(d.date, {
          tempMin: d.tempMin,
          tempMax: d.tempMax,
          code: d.code,
        });
      }
    }

    return {
      holidayByDate,
      eventsByDate,
      weatherByDate,
      hasTerrace: profile.hasTerrace,
      covered,
      recentSlots,
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
   * Datums in het venster waarvoor al iets klaarstaat: een campagne die nog
   * loopt (concept/ingepland/actief) of een openstaand rustig-moment-voorstel.
   * Die dagen zijn geen kans meer — en door ze hier te weren, vóór de week-cap,
   * schuift er wél iets anders voor in de plaats.
   */
  private async getCoveredDates(
    businessId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Set<string>> {
    const out = new Set<string>();
    try {
      const { data } = await this.supabase.client
        .from('campaigns')
        .select('scheduled_for, status')
        .eq('business_id', businessId)
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', `${fromIso}T00:00:00Z`)
        .lte('scheduled_for', `${toIso}T23:59:59Z`);
      for (const row of data ?? []) {
        const status = row.status as string | null;
        if (status === 'afgerond' || status === 'gearchiveerd') continue;
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
        if (d && d >= fromIso && d <= toIso) out.add(d);
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
          add(`${weekday}|${ctx.target_daypart}`, { weekIndex });
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
  private async getQuietPerWeek(businessId: string): Promise<number> {
    const { data } = await this.supabase.client
      .from('businesses')
      .select('quiet_moments_per_week')
      .eq('id', businessId)
      .maybeSingle();
    const v = data?.quiet_moments_per_week as number | null | undefined;
    return typeof v === 'number' && v >= 1 ? v : DEFAULT_QUIET_PER_WEEK;
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
