/**
 * ============================================================
 * Rustige momenten, model v2 (prototype, nog niet aangesloten)
 * ============================================================
 *
 * Verschillen met het live model (getQuietMoments):
 *   1. UURNIVEAU: we meten per uur en zoeken het rustigste tijdvenster
 *      (windowHours) BINNEN een dagdeel. Een dip van 15 tot 17 uur verdwijnt
 *      dus niet in het gemiddelde van een heel dagdeel.
 *   2. VIER DAGDELEN (ochtend, lunch, middag, diner; het dagdeel 'avond' is
 *      vervallen omdat het nooit werd gekozen, diner loopt nu tot sluiting).
 *      Het tijdvenster zit BINNEN een dagdeel.
 *   3. MARGES: vlak na opening en vlak voor sluiting stellen we niets voor
 *      (dan wordt er klaargezet of afgebouwd).
 *   4. HAALBAARHEID per dagdeel en weekdag: een ochtend doordeweeks is
 *      moeilijk te bereiken, een weekendavond makkelijk. Vermenigvuldigt de score.
 *   5. EVENEMENT = KANS: een evenement in de buurt geeft een bonus op de score
 *      (mensen in de buurt) in plaats van de dag "drukker" te rekenen.
 *   6. TEMPO TELT INGEPLANDE DAGEN MEE, en een uitzonderlijke kans (evenement
 *      plus hoge score) mag boven het tempo uit, als "kans van de week".
 *   7. EIGENAAR-INSTELLING: momenten (weekdag x dagdeel) die de eigenaar uit
 *      heeft gezet, krijgen nooit een voorstel.
 *   8. BELEIDSLAAG (zelfde regels als het live model): feestdagen en al
 *      afgedekte dagen vallen af; cool-down op recent gebruikte momenten;
 *      spreiding over dagdelen binnen een week; leren van uitkomsten.
 *
 * Puur (geen database).
 */
import {
  weatherBusynessFactor,
  eventBusynessFactor,
  cooldownFactor,
  feedbackFactor,
  SAME_WEEK_DAYPART_DAMP,
  type WeatherSignal,
  type EventSignal,
  type SlotHit,
  type SlotPerformance,
} from './quiet-signals';

export type Dagdeel = 'ochtend' | 'lunch' | 'middag' | 'diner';
/** Vaste vensters (uur, van tot exclusief), zoals in het live model. */
export const DAGDEEL_DEFS: { key: Dagdeel; from: number; to: number }[] = [
  { key: 'ochtend', from: 6, to: 11 },
  { key: 'lunch', from: 11, to: 14 },
  { key: 'middag', from: 14, to: 17 },
  { key: 'diner', from: 17, to: 24 },
];
export const DAGDELEN: Dagdeel[] = DAGDEEL_DEFS.map((d) => d.key);

export interface QuietParamsV2 {
  /** Uren na opening waarin niets wordt voorgesteld (klaarzetten). */
  openMarginHours: number;
  /** Uren voor sluiting waarin niets wordt voorgesteld (afbouwen). */
  closeMarginHours: number;
  /** Lengte van het tijdvenster (uren) dat we in een dagdeel zoeken. */
  windowHours: number;
  /** Kansdrempel als deel van je piek: het gat moet minstens zo groot zijn. */
  gapFrac: number;
  anomalyWeight: number;
  unusualSpreadMult: number;
  /** Ondergrens voor "ongewoon": minimaal dit deel (0,08 = 8%) onder het verwachte niveau. */
  relDevFloor: number;
  /** Hoe zwaar een evenement in de buurt meetelt in de score. */
  eventBonusWeight: number;
  /** Vanaf welke score een evenement-kans boven het tempo uit mag. */
  exceptionScore: number;
  /** Haalbaarheid 0..1 per dagdeel, per weekdag (ma..zo). */
  haalbaarheid: Record<Dagdeel, number[]>;
}

export const QUIET_PARAMS_V2: QuietParamsV2 = {
  openMarginHours: 1,
  closeMarginHours: 2,
  windowHours: 2,
  gapFrac: 0.35,
  anomalyWeight: 0.5,
  unusualSpreadMult: 2.0,
  relDevFloor: 0.12,
  eventBonusWeight: 0.5,
  exceptionScore: 0.8,
  haalbaarheid: {
    ochtend: [0.3, 0.3, 0.3, 0.3, 0.4, 0.7, 0.7],
    lunch: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
    middag: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
    diner: [0.85, 0.85, 0.85, 0.85, 0.95, 1, 1],
  },
};

export type SignalsV2 = {
  weather?: Map<string, WeatherSignal>;
  events?: Map<string, EventSignal[]>;
  hasTerrace?: boolean;
  /** Datums waarvoor al een concept, campagne of voorstel staat. */
  planned?: Set<string>;
  /** Feestdagen (datum -> naam). Vallen af, ook de drukke. */
  holidays?: Map<string, string>;
  /**
   * Door de eigenaar uitgezette momenten, als "weekdag|dagdeel" met weekdag
   * 0=ma..6=zo, bijvoorbeeld "2|middag" (woensdagmiddag). Daar komt nooit
   * een voorstel.
   */
  disabledSlots?: Set<string>;
  /** Eerder gebruikte momenten voor de cool-down, per "weekdag|dagdeel". */
  recentSlots?: Map<string, { weekIndex: number; weak?: boolean }[]>;
  /** Wat campagnes op een moment eerder deden (leren van uitkomsten). */
  slotPerformance?: Map<string, SlotPerformance>;
  businessMedianLift?: number;
};

export type MomentV2 = {
  date: string;
  weekday: number; // 0=ma..6=zo
  daypart: Dagdeel;
  fromHour: number;
  toHour: number; // exclusief
  expectedPct: number;
  gap: number;
  score: number;
  unusual: boolean;
  kind: 'structureel' | 'incidenteel';
  eventBoost: number; // 0..1
  /** true = boven het tempo uit, als "kans van de week". */
  exception: boolean;
  /** true = gekozen omdat het gebruikelijke moment recent al gebruikt is. */
  rotated: boolean;
};

export type WeekSummary = {
  week: string; // maandag van de week
  planned: number;
  cap: number;
  picked: number;
  exception: boolean;
};

export type QuietResultV2 = {
  moments: MomentV2[];
  weeks: WeekSummary[];
  debug: {
    peak: number;
    /** Per weekdag per uur: telt dit uur mee als voorstel-uur? */
    usable: boolean[][];
    /** Per weekdag per dagdeel: rustigste venster [van, tot) en gemiddelde. */
    cells: ({ from: number; to: number; avg: number } | null)[][];
  };
};

function medianExact(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Robuuste two-way ontleding (zelfde als het live model).
function medianPolish(matrix: (number | null)[][]): (number | null)[][] {
  const R = matrix.length;
  const C = matrix[0]?.length ?? 0;
  const res = matrix.map((row) => row.slice());
  const rowEff = new Array<number>(R).fill(0);
  const colEff = new Array<number>(C).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    let maxShift = 0;
    for (let d = 0; d < R; d++) {
      const vals = res[d].filter((v): v is number => v != null);
      if (!vals.length) continue;
      const m = medianExact(vals);
      for (let j = 0; j < C; j++)
        if (res[d][j] != null) res[d][j] = (res[d][j] as number) - m;
      rowEff[d] += m;
      maxShift = Math.max(maxShift, Math.abs(m));
    }
    const rm = medianExact(rowEff);
    for (let d = 0; d < R; d++) rowEff[d] -= rm;
    for (let j = 0; j < C; j++) {
      const vals: number[] = [];
      for (let d = 0; d < R; d++) {
        const v = res[d][j];
        if (v != null) vals.push(v);
      }
      if (!vals.length) continue;
      const m = medianExact(vals);
      for (let d = 0; d < R; d++)
        if (res[d][j] != null) res[d][j] = (res[d][j] as number) - m;
      colEff[j] += m;
      maxShift = Math.max(maxShift, Math.abs(m));
    }
    const cm = medianExact(colEff);
    for (let j = 0; j < C; j++) colEff[j] -= cm;
    if (maxShift < 0.01) break;
  }
  return res;
}

const mondayIndex = (iso: string): number =>
  (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const mondayOf = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - mondayIndex(iso));
  return d.toISOString().slice(0, 10);
};
function* eachDate(fromIso: string, toIso: string): Generator<string> {
  const d = new Date(`${fromIso}T12:00:00Z`);
  const end = new Date(`${toIso}T12:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function computeQuietV2(
  pattern: number[][],
  fromIso: string,
  toIso: string,
  perWeek: number,
  signals: SignalsV2 = {},
  overrides: Partial<QuietParamsV2> = {},
): QuietResultV2 {
  const P: QuietParamsV2 = { ...QUIET_PARAMS_V2, ...overrides };
  const dagdeelOf = (h: number): Dagdeel | null =>
    DAGDEEL_DEFS.find((d) => h >= d.from && h < d.to)?.key ?? null;

  // 1. Per weekdag: open uren en de uren waarop we iets mogen voorstellen.
  const usable: boolean[][] = pattern.map((row) => {
    const open = row.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
    const mask = new Array<boolean>(24).fill(false);
    if (!open.length) return mask;
    const first = open[0] + P.openMarginHours;
    const last = open[open.length - 1] + 1 - P.closeMarginHours; // exclusief
    for (const h of open) if (h >= first && h < last) mask[h] = true;
    return mask;
  });

  // 2. Piek: het drukste blok van windowHours uren (over alle open uren).
  let peak = 0;
  for (const row of pattern) {
    for (let h = 0; h + P.windowHours <= 24; h++) {
      const w = row.slice(h, h + P.windowHours);
      if (w.every((v) => v > 0)) {
        peak = Math.max(peak, w.reduce((a, b) => a + b, 0) / P.windowHours);
      }
    }
  }

  // 3. Per weekdag en dagdeel: het rustigste venster van windowHours
  //    aaneengesloten bruikbare uren.
  const cells: ({ from: number; to: number; avg: number } | null)[][] =
    pattern.map((row, d) =>
      DAGDELEN.map((dp) => {
        let best: { from: number; to: number; avg: number } | null = null;
        for (let h = 0; h + P.windowHours <= 24; h++) {
          let ok = true;
          for (let k = h; k < h + P.windowHours; k++) {
            if (!usable[d][k] || dagdeelOf(k) !== dp) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const avg =
            row.slice(h, h + P.windowHours).reduce((a, b) => a + b, 0) /
            P.windowHours;
          if (!best || avg < best.avg)
            best = { from: h, to: h + P.windowHours, avg };
        }
        return best;
      }),
    );

  const empty: QuietResultV2 = {
    moments: [],
    weeks: [],
    debug: { peak, usable, cells },
  };
  if (!peak) return empty;

  // 4. Normale schommeling (MAD), gemeten in VERHOUDINGEN. We ontleden de
  //    logaritme van de drukte, dus een drukke weekenddag met grotere dalen in
  //    punten wordt niet per definitie "ongewoon". (Op punten rekenen liet elke
  //    weekenddag ongewoon lijken en gaf het label aan bijna de helft.)
  const grid = cells.map((row) =>
    row.map((c) => (c ? Math.log(Math.max(c.avg, 1)) : null)),
  );
  const residual = medianPolish(grid);
  const resVals = residual.flat().filter((v): v is number => v != null);
  if (!resVals.length) return empty;
  const medRes = medianExact(resVals);
  const mad = medianExact(resVals.map((r) => Math.abs(r - medRes)));
  const spread = 1.4826 * mad;
  const unusualThreshold = Math.max(
    P.relDevFloor,
    P.unusualSpreadMult * spread,
  );

  // 5. Kandidaten per datum: het beste dagdeel (max één per dag).
  type Cand = MomentV2 & { week: string };
  const cands: Cand[] = [];
  for (const date of eachDate(fromIso, toIso)) {
    if (signals.planned?.has(date)) continue; // staat al iets voor
    if (signals.holidays?.has(date)) continue; // feestdag: geen rustig moment
    const weekday = mondayIndex(date);
    const { factor } = weatherBusynessFactor(
      signals.weather?.get(date) ?? null,
      !!signals.hasTerrace,
    );
    const evs = signals.events?.get(date) ?? [];
    const evFactor = evs.length ? eventBusynessFactor(evs).factor : 1;
    const eventBoost = Math.min(1, (evFactor - 1) / 0.5);

    let best: Cand | null = null;
    DAGDELEN.forEach((dp, j) => {
      const c = cells[weekday][j];
      const base = residual[weekday][j];
      if (!c || base == null) return;
      if (signals.disabledSlots?.has(`${weekday}|${dp}`)) return; // uit gezet door de eigenaar
      const adjusted = Math.max(0, Math.min(100, c.avg * factor));
      // Verwacht niveau van deze cel (uit de ontleding), en hoeveel het
      // werkelijke (weer-gecorrigeerde) niveau daaronder of erboven zit, als
      // verhouding.
      const expected = c.avg * Math.exp(-base);
      const dev = adjusted / Math.max(expected, 1) - 1;
      const gap = peak - adjusted;
      if (gap < P.gapFrac * peak) return;
      const haal = P.haalbaarheid[dp][weekday] ?? 1;
      const anomaly = Math.min(1, Math.max(0, -dev) / unusualThreshold);
      const score =
        (gap / peak +
          P.anomalyWeight * anomaly +
          P.eventBonusWeight * eventBoost) *
        haal;
      if (!best || score > best.score) {
        best = {
          date,
          weekday,
          daypart: dp,
          fromHour: c.from,
          toHour: c.to,
          expectedPct: Math.round(adjusted),
          gap: Math.round(gap),
          score: Math.round(score * 1000) / 1000,
          unusual: dev <= -unusualThreshold,
          kind: factor <= 0.92 ? 'incidenteel' : 'structureel',
          eventBoost: Math.round(eventBoost * 100) / 100,
          exception: false,
          rotated: false,
          week: mondayOf(date),
        };
      }
    });
    if (best) cands.push(best);
  }

  // 6. Selectie per week, in datumvolgorde, met de beleidslaag: tempo minus wat
  //    al ingepland staat, cool-down op recent gebruikte momenten (en elke
  //    keuze telt meteen mee voor de weken erna), spreiding over dagdelen
  //    binnen een week en leren van uitkomsten. Een uitzonderlijke
  //    evenement-kans mag daarboven uit (max één per week).
  const weekKeys = new Set<string>();
  for (const d of eachDate(fromIso, toIso)) weekKeys.add(mondayOf(d));
  const weekList = [...weekKeys].sort();
  const weekIndex = (monday: string) =>
    Math.round(
      (Date.parse(`${monday}T12:00:00Z`) -
        Date.parse(`${weekList[0]}T12:00:00Z`)) /
        (7 * 86_400_000),
    );
  const plannedPerWeek = new Map<string, number>();
  for (const p of signals.planned ?? []) {
    if (p < fromIso || p > toIso) continue;
    plannedPerWeek.set(mondayOf(p), (plannedPerWeek.get(mondayOf(p)) ?? 0) + 1);
  }
  const hits = new Map<string, { weekIndex: number; weak?: boolean }[]>(
    [...(signals.recentSlots?.entries() ?? [])].map(([k, v]) => [k, [...v]]),
  );
  const moments: MomentV2[] = [];
  const weeks: WeekSummary[] = [];
  for (const week of weekList) {
    const wi = weekIndex(week);
    const planned = plannedPerWeek.get(week) ?? 0;
    const slots = Math.max(0, perWeek - planned);
    const remaining = cands.filter((c) => c.week === week);
    const picked: Cand[] = [];
    const usedDayparts = new Set<Dagdeel>();
    for (let n = 0; n < slots && remaining.length > 0; n++) {
      let bestIdx = -1;
      let bestScore = -Infinity;
      let bestFactor = 1;
      let anyDamped = false;
      remaining.forEach((k, idx) => {
        const uses: SlotHit[] = (
          hits.get(`${k.weekday}|${k.daypart}`) ?? []
        ).map((u) => ({ weeksAgo: wi - u.weekIndex, weak: u.weak }));
        let factor = cooldownFactor(uses);
        if (usedDayparts.has(k.daypart)) factor *= SAME_WEEK_DAYPART_DAMP;
        factor *= feedbackFactor(
          signals.slotPerformance?.get(`${k.weekday}|${k.daypart}`),
          signals.businessMedianLift ?? 0,
        );
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
      if (anyDamped && bestFactor >= 1 && chosen.kind === 'structureel') {
        chosen.rotated = true;
      }
      picked.push(chosen);
      usedDayparts.add(chosen.daypart);
      const key = `${chosen.weekday}|${chosen.daypart}`;
      hits.set(key, [...(hits.get(key) ?? []), { weekIndex: wi }]);
    }
    let exception = false;
    const ex = remaining
      .sort((a, b) => b.score - a.score)
      .find((c) => c.eventBoost > 0 && c.score >= P.exceptionScore);
    if (ex) {
      picked.push({ ...ex, exception: true });
      exception = true;
    }
    picked.forEach((c) => {
      const m: MomentV2 & { week?: string } = { ...c };
      delete m.week;
      moments.push(m);
    });
    weeks.push({
      week,
      planned,
      cap: perWeek,
      picked: picked.length,
      exception,
    });
  }
  moments.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { moments, weeks, debug: { peak, usable, cells } };
}
