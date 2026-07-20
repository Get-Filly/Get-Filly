// ============================================================
// busyness.ts — drukte-model voor het herontworpen dashboard
// ============================================================
//
// Naad tussen UI en databron. Vandaag afgeleid uit occupancy_days (seed)
// + een generiek uur-patroon; later vervangbaar door de echte bron
// (zie BACKLOG: third-party achter deze functie).
//
// Twee lijnen per dag:
//   - hours  : verwacht uur-verloop (Google's typische patroon)
//   - actual : werkelijk uur-verloop van díe datum (null in de toekomst)
//
// Nieuw t.o.v. eerder: 24-uurs model (index 0-23) i.p.v. vaste
// half-uur-slots, en het zichtbare bereik volgt de OPENINGSTIJDEN van
// het restaurant (opent om 08:00 → x-as begint bij 08:00).

import { mondayIndex } from "./calendar-data";
import { getSpecialDays, type SpecialDay } from "@/lib/special-days";
import { isOpenOn } from "@/lib/occupancy-window";
import type { OccupancyDay, Restaurant } from "@/lib/api";

export type Timeframe = "past" | "today" | "future";

export type DayBusyness = {
  date: Date;
  iso: string;
  colMon: number; // 0=ma … 6=zo
  displayPct: number; // gemiddelde drukte over open uren (voor rustig/druk)
  hours: number[]; // 24 waarden (0-100), verwacht
  actual: number[] | null; // 24 waarden, werkelijk (seed-modus); null in de toekomst
  // Echte gemeten drukte (real-modus): [uur, pct]-punten die dag. null =
  // geen metingen / geen echte bron. Gebruikt i.p.v. `actual` als aanwezig.
  actualPoints: [number, number][] | null;
  openHour: number; // eerste zichtbare uur (uit openingstijden)
  closeHour: number; // laatste zichtbare uur
  timeframe: Timeframe;
  quiet: [number, number] | null; // [startUur, eindUur] van het rustige dal
  isQuiet: boolean; // rustig moment = kans
  special: SpecialDay | null;
};

// Typisch restaurant-dagverloop (0-100), index = uur 0..23. Piek ~90 zodat
// er ruimte boven blijft (de grafiek tekent tot ~115). Lunch + diner.
const BASE24 = [
  0, 0, 0, 0, 0, 0, 0, 3, 8, 15, 26, 55, 85, 88, 62, 38, 30, 46, 72, 90, 86, 66,
  40, 18,
];
// Weekdag-factor (ma..zo): weekend drukker.
const WD_FACTOR = [0.85, 0.8, 0.9, 0.98, 1.08, 1.18, 1.0];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isoOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + days);
  return d;
}

export function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - mondayIndex(d.getDay()));
  return d;
}

const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// Google's live-drukte (via Apify) is een GROVE bron: 'ie springt tussen
// extremen (0 ↔ 100), wat onrealistisch is voor echte bezetting. We maken
// de werkelijk-lijn plausibel zonder de echte afwijking te verliezen:
//   1. licht gladstrijken over aangrenzende uren (3-punts, midden zwaarder);
//   2. de afwijking t.o.v. het VERWACHTE (historische) patroon dempen
//      (ACTUAL_DAMP), zodat 0/100-pieken naar het normaal toe getrokken
//      worden maar een echte drukke/rustige dag zichtbaar blijft.
// ACTUAL_DAMP = gewicht op de (gladgestreken) meting; de rest gaat naar
// het historische normaal. 0.4 = 40% meting / 60% normaal → de historie
// domineert (bewuste keuze, want Google-live is grof). Naarmate er meer
// weken eigen data zijn, kan dit losser en verschuift het anker naar de
// eigen mediaan-per-weekdag.
const ACTUAL_DAMP = 0.4;
function shapeActual(
  raw: [number, number][],
  expected: number[],
): [number, number][] {
  if (!raw.length) return raw;
  const byHour = new Map(raw.map(([h, p]) => [h, p]));
  return raw
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map(([h]) => {
      let sum = 0;
      let wsum = 0;
      // 5-punts gewogen gemiddelde (midden zwaarst), alleen beschikbare
      // buren → bredere gladstrijking dan 3-punts.
      for (const [dh, w] of [
        [-2, 1],
        [-1, 2],
        [0, 3],
        [1, 2],
        [2, 1],
      ] as const) {
        const v = byHour.get(h + dh);
        if (v !== undefined) {
          sum += v * w;
          wsum += w;
        }
      }
      const smoothed = wsum ? sum / wsum : (byHour.get(h) ?? 0);
      const exp = expected[h] ?? smoothed;
      // Naar historisch toe: toon de gedempte afwijking rond het verwachte.
      return [h, clamp(exp + ACTUAL_DAMP * (smoothed - exp))] as [
        number,
        number,
      ];
    });
}

function hourly24(scale: number, seed: string): number[] {
  const h = hash(seed);
  return BASE24.map((b, i) => clamp(b * scale + (((h + i * 13) % 7) - 3)));
}

const hourOf = (hhmm: string) => parseInt(hhmm.slice(0, 2), 10);
const minsOf = (hhmm: string) => parseInt(hhmm.slice(3, 5), 10);

export type OpeningHoursMap = Record<
  string,
  { open: string; close: string } | null
>;

// Open-bereik → [openHour, closeHour] voor de x-as, PER dag.
// Bron 1: opening_hours (dít bewerkt de eigenaar nu op /account, per dag).
// Bron 2: openingstijden uit de busyness-pull (Google working_hours).
// Bron 3: service_periods (terugval; onboarding zet dit nog). Fallback 9-23.
function openRange(
  restaurant: Restaurant | null,
  date: Date,
  busynessHours?: OpeningHoursMap | null,
): [number, number] {
  const dayKey = WEEKDAY_KEYS[date.getDay()];

  // Eigen ingestelde tijden winnen; anders die uit de pull.
  const oh = restaurant?.opening_hours?.[dayKey] ?? busynessHours?.[dayKey];
  if (oh && oh.open && oh.close) {
    const open = hourOf(oh.open);
    // Sluit op een half uur → rond omhoog zodat dat laatste uur zichtbaar is.
    const e = hourOf(oh.close) + (minsOf(oh.close) > 0 ? 1 : 0);
    const close = e <= open ? 23 : Math.min(e, 23); // sluit na middernacht → t/m 23
    if (close > open) return [Math.max(0, open), close];
  }

  const sp = restaurant?.service_periods;
  if (sp) {
    let minStart = 99;
    let maxEnd = -1;
    for (const svc of Object.keys(sp)) {
      const cfg = sp[svc]?.[dayKey];
      if (cfg && cfg.start && cfg.end) {
        const s = hourOf(cfg.start);
        const e = hourOf(cfg.end) + (minsOf(cfg.end) > 0 ? 1 : 0);
        if (s < minStart) minStart = s;
        if (e > maxEnd) maxEnd = e;
      }
    }
    if (maxEnd > minStart) {
      return [Math.max(0, minStart), Math.min(23, maxEnd)];
    }
  }

  return [9, 23];
}

// Langste aaneengesloten laag-drukte-reeks binnen de open uren (het dal).
function quietWindow(
  hours: number[],
  open: number,
  close: number,
): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let h = open; h <= close + 1; h++) {
    const low = h <= close && hours[h] <= 40;
    if (low && start === -1) start = h;
    if (!low && start !== -1) {
      const run: [number, number] = [start, h - 1];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      start = -1;
    }
  }
  return best;
}

export function specialDayMap(years: number[]): Map<string, SpecialDay> {
  const map = new Map<string, SpecialDay>();
  for (const y of years) for (const s of getSpecialDays(y)) map.set(s.date, s);
  return map;
}

export function buildDayBusyness(
  date: Date,
  realByIso: Map<string, number>,
  restaurant: Restaurant | null,
  threshold: number,
  todayIso: string,
  specials: Map<string, SpecialDay>,
  // Echt weekpatroon uit busyness_snapshots (7x24, 0=ma..6=zo). Als
  // aanwezig is dít de verwachte lijn i.p.v. de seed. null = terugval.
  pattern?: number[][] | null,
  // Openingstijden uit de busyness-pull (grafiek-x-as terugval).
  busynessHours?: OpeningHoursMap | null,
  // Echte werkelijk-drukte per datum ([uur, pct]) uit de live-metingen.
  actualByDate?: Record<string, [number, number][]> | null,
): DayBusyness {
  const iso = isoOf(date);
  const colMon = mondayIndex(date.getDay());
  const tf: Timeframe = iso === todayIso ? "today" : iso < todayIso ? "past" : "future";
  const wd = WD_FACTOR[colMon];

  // Real-modus zodra er een echt weekpatroon is: dan komt de werkelijk-lijn
  // uit de live-metingen (actualPoints) i.p.v. de seed.
  const useReal = !!(pattern && pattern.length === 7);

  // Verwacht: echt Google-patroon indien beschikbaar, anders seed op
  // weekdag (stabiel per weekdag, niet per datum).
  const realDay = pattern?.[colMon];
  const hours =
    realDay && realDay.length === 24
      ? realDay.map(clamp)
      : hourly24(wd, `wd${colMon}`);

  // Werkelijk. Real-modus: echte gemeten uren (of null als nog geen meting
  // die dag). Seed-modus: het oude afgeleide dagverloop.
  let actual: number[] | null = null;
  let actualPoints: [number, number][] | null = null;
  if (tf !== "future") {
    if (useReal) {
      const pts = actualByDate?.[iso];
      actualPoints = pts && pts.length ? shapeActual(pts, hours) : null;
    } else {
      const hb = hash(iso);
      let dayFactor = 0.85 + (hb % 30) / 100;
      if (specials.get(iso)) dayFactor += 0.2;
      const real = realByIso.get(iso);
      if (real !== undefined) dayFactor *= real / 60; // echte dag-pct t.o.v. baseline
      actual = hourly24(wd * dayFactor, iso);
    }
  }

  const [openHour, closeHour] = openRange(restaurant, date, busynessHours);
  const disp = actual ?? hours;
  let sum = 0;
  let n = 0;
  for (let h = openHour; h <= closeHour; h++) {
    sum += disp[h];
    n++;
  }
  const displayPct = n ? Math.round(sum / n) : 0;

  return {
    date,
    iso,
    colMon,
    displayPct,
    hours,
    actual,
    actualPoints,
    openHour,
    closeHour,
    timeframe: tf,
    quiet: quietWindow(hours, openHour, closeHour),
    isQuiet: displayPct < threshold && isOpenOn(restaurant, iso),
    special: specials.get(iso) ?? null,
  };
}

export function buildWeek(
  monday: Date,
  realByIso: Map<string, number>,
  restaurant: Restaurant | null,
  threshold: number,
  todayIso: string,
  pattern?: number[][] | null,
  busynessHours?: OpeningHoursMap | null,
  actualByDate?: Record<string, [number, number][]> | null,
): DayBusyness[] {
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const years = Array.from(new Set(days.map((d) => d.getFullYear())));
  const specials = specialDayMap(years);
  return days.map((d) =>
    buildDayBusyness(
      d,
      realByIso,
      restaurant,
      threshold,
      todayIso,
      specials,
      pattern,
      busynessHours,
      actualByDate,
    ),
  );
}

export function occupancyMap(rows: OccupancyDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date.slice(0, 10), r.occupancy_pct);
  return m;
}
