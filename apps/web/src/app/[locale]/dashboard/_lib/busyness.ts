// ============================================================
// busyness.ts — drukte-model voor het herontworpen dashboard
// ============================================================
//
// Dit is de NAAD tussen de UI en de databron. Vandaag leiden we de
// drukte af uit de bestaande occupancy_days (seed) + de patronen in
// hour-heatmap.ts. Zodra de Google "populaire tijden"-scraper er is,
// hoeft alleen `buildDayBusyness` z'n bron te wisselen; de hele
// BusynessCard blijft ongemoeid.
//
// Twee lijnen per dag:
//   - pattern : het TYPISCHE verloop voor die weekdag ("gemiddeld")
//   - actual  : het WERKELIJKE verloop van díe datum ("werkelijk"),
//               alleen voor dagen tot en met vandaag. Toekomst = null
//               (dan tonen we het patroon als voorspelling).
//
// Alles is relatief (0-100 t.o.v. de eigen piek), nooit exacte tafels
// of gasten — conform de privacy-/AVG-keuze rond bezettingsdata.

import { seededOccupancy, mondayIndex } from "./calendar-data";
import { hourlyForDay, HALF_HOUR_SLOTS } from "./hour-heatmap";
import { getSpecialDays, type SpecialDay } from "@/lib/special-days";
import { isOpenOn } from "@/lib/occupancy-window";
import type { OccupancyDay, Restaurant } from "@/lib/api";

export type Timeframe = "past" | "today" | "future";

export type DayBusyness = {
  date: Date;
  iso: string; // YYYY-MM-DD
  colMon: number; // 0=ma … 6=zo
  // Overall relatieve drukte (0-100) waarmee we "rustig/druk" bepalen.
  displayPct: number;
  // Uur-verloop (22 half-uur-slots, aligned met HALF_HOUR_SLOTS).
  pattern: number[];
  actual: number[] | null;
  timeframe: Timeframe;
  // [start, eind] indices in de slots voor het gearceerde rustige
  // venster, afgeleid uit het patroon. Null als er geen dal is.
  quiet: [number, number] | null;
  // Rustig moment = kans (onder de eigenaar-drempel + open die dag).
  isQuiet: boolean;
  special: SpecialDay | null;
};

// X-as: welke slots een tijd-label krijgen op de dag-grafiek.
export const AXIS_TICKS = [0, 4, 8, 12, 16, 20] as const;
export const AXIS_LABELS = AXIS_TICKS.map((i) => HALF_HOUR_SLOTS[i]);
export const SLOT_COUNT = HALF_HOUR_SLOTS.length;

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

// Maandag (00:00) van de week waar `date` in valt. Onze grid start op ma.
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - mondayIndex(d.getDay()));
  return d;
}

// Langste aaneengesloten reeks lage-drukte-slots (het middag-dal).
// Dient als het "rustig"-venster op de grafiek. Drempel 40 = tier-0/1
// grens uit hour-heatmap (occupancyTier).
function quietWindow(pattern: number[]): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= pattern.length; i++) {
    const low = i < pattern.length && pattern[i] <= 40;
    if (low && start === -1) start = i;
    if (!low && start !== -1) {
      const run: [number, number] = [start, i - 1];
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      start = -1;
    }
  }
  return best;
}

// Speciale dagen voor een set jaren, als iso→SpecialDay map (memobaar
// door de caller). Twee jaren dekken een week over de jaargrens.
export function specialDayMap(years: number[]): Map<string, SpecialDay> {
  const map = new Map<string, SpecialDay>();
  for (const y of years) {
    for (const s of getSpecialDays(y)) map.set(s.date, s);
  }
  return map;
}

function timeframeOf(iso: string, todayIso: string): Timeframe {
  if (iso === todayIso) return "today";
  return iso < todayIso ? "past" : "future";
}

// Bouw één dag. `realByIso` = echte occupancy_days (relatief pct).
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
  const tf = timeframeOf(iso, todayIso);

  // "Gemiddeld patroon" = stabiele weekdag-baseline (vaste dag-seed 15
  // zodat het niet per datum verspringt).
  const weekdayBaselinePct = seededOccupancy(15, colMon);
  // "Werkelijk" = echte data indien aanwezig, anders de dag-specifieke
  // seed (varieert wél per datum → toont "drukker/rustiger dan normaal").
  // Toekomst: geen werkelijke data.
  const actualPct =
    tf === "future"
      ? null
      : realByIso.get(iso) ?? seededOccupancy(date.getDate(), colMon);

  const pattern = hourlyForDay(weekdayBaselinePct, colMon);
  const actual = actualPct === null ? null : hourlyForDay(actualPct, date.getDate());
  const displayPct = actualPct ?? weekdayBaselinePct;

  return {
    date,
    iso,
    colMon,
    displayPct,
    pattern,
    actual,
    timeframe: tf,
    quiet: quietWindow(pattern),
    isQuiet: displayPct < threshold && isOpenOn(restaurant, iso),
    special: specials.get(iso) ?? null,
  };
}

// Bouw een hele week (ma..zo) vanaf een maandag-datum.
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

// occupancy_days[] → iso→pct map. Klein hulpje voor de caller.
export function occupancyMap(rows: OccupancyDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date.slice(0, 10), r.occupancy_pct);
  return m;
}
