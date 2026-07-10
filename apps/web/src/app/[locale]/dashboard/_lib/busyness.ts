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
  actual: number[] | null; // 24 waarden, werkelijk; null in de toekomst
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

function hourly24(scale: number, seed: string): number[] {
  const h = hash(seed);
  return BASE24.map((b, i) => clamp(b * scale + (((h + i * 13) % 7) - 3)));
}

// Openingstijden → [openHour, closeHour] voor de x-as. Fallback 9-23.
function openRange(restaurant: Restaurant | null, date: Date): [number, number] {
  const oh = restaurant?.opening_hours?.[WEEKDAY_KEYS[date.getDay()]];
  let open = 9;
  let close = 23;
  if (oh && oh.open && oh.close) {
    open = parseInt(oh.open.slice(0, 2), 10);
    let c = parseInt(oh.close.slice(0, 2), 10);
    // Sluit na middernacht (bv. 02:00) → toon t/m 23:00.
    close = c <= open ? 23 : Math.min(c, 23);
  }
  if (!(close > open)) {
    open = 9;
    close = 23;
  }
  return [open, close];
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
): DayBusyness {
  const iso = isoOf(date);
  const colMon = mondayIndex(date.getDay());
  const tf: Timeframe = iso === todayIso ? "today" : iso < todayIso ? "past" : "future";
  const wd = WD_FACTOR[colMon];

  // Verwacht: stabiel per weekdag (seed op weekdag, niet op datum).
  const hours = hourly24(wd, `wd${colMon}`);

  // Werkelijk: per datum, varieert rond verwacht (toont drukker/rustiger
  // dan normaal). Echte occupancy_days schalen de dag mee als aanwezig.
  let actual: number[] | null = null;
  if (tf !== "future") {
    const hb = hash(iso);
    let dayFactor = 0.85 + (hb % 30) / 100;
    if (specials.get(iso)) dayFactor += 0.2;
    const real = realByIso.get(iso);
    if (real !== undefined) dayFactor *= real / 60; // echte dag-pct t.o.v. baseline
    actual = hourly24(wd * dayFactor, iso);
  }

  const [openHour, closeHour] = openRange(restaurant, date);
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
): DayBusyness[] {
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const years = Array.from(new Set(days.map((d) => d.getFullYear())));
  const specials = specialDayMap(years);
  return days.map((d) =>
    buildDayBusyness(d, realByIso, restaurant, threshold, todayIso, specials),
  );
}

export function occupancyMap(rows: OccupancyDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date.slice(0, 10), r.occupancy_pct);
  return m;
}
