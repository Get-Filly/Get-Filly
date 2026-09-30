/**
 * Dagoverzicht van de drukte (mig 0079): de rekenkern, puur en zonder
 * database zodat 'ie te testen is. De service haalt de ruwe metingen,
 * omstandigheden en het patroon op, en schrijft het resultaat weg.
 */
import type { LiveRow } from './busyness.service';

export type DailyCell = {
  day: string; // YYYY-MM-DD, Amsterdamse datum
  weekday: number; // 0=ma..6=zo
  hour: number;
  actualPct: number;
  expectedPct: number | null;
  measurements: number;
};

export type DayContextRow = {
  day: string;
  weekday: number;
  weatherCode: number | null;
  tempMax: number | null;
  tempMin: number | null;
  holiday: string | null;
  events: { name: string; category: string; distanceKm: number }[];
};

const median = (nums: number[]): number => {
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

export const weekdayOf = (iso: string): number =>
  (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Per (datum, uur) de mediaan van de live-metingen in dat uur, naast wat het
 * weekpatroon voor dat uur zei. Zelfde uur-definitie als het maandoverzicht
 * en de bezettingsrapportage.
 */
export function aggregateDaily(
  rows: LiveRow[],
  pattern: number[][] | null,
): DailyCell[] {
  const perDateHour = new Map<string, number[]>();
  for (const row of rows) {
    const when = new Date(row.captured_at);
    const day = amsDate(when);
    const hour = row.live_hour ?? amsHour(when);
    if (hour == null || hour < 0 || hour > 23) continue;
    const key = `${day}|${hour}`;
    const arr = perDateHour.get(key);
    if (arr) arr.push(row.live_pct);
    else perDateHour.set(key, [row.live_pct]);
  }

  const out: DailyCell[] = [];
  for (const [key, pcts] of perDateHour) {
    const [day, h] = key.split('|');
    const hour = Number(h);
    const weekday = weekdayOf(day);
    const exp = pattern?.[weekday]?.[hour];
    out.push({
      day,
      weekday,
      hour,
      actualPct: Math.round(median(pcts) * 100) / 100,
      expectedPct: typeof exp === 'number' && exp > 0 ? exp : null,
      measurements: pcts.length,
    });
  }
  out.sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour);
  return out;
}

/**
 * Omstandigheden per datum. Een bron die ontbreekt (geen weer meer op te
 * halen, geen evenementen) geeft een lege waarde, nooit een fout: de
 * drukte zelf is het belangrijkste en moet altijd bewaard blijven.
 */
export function buildDayContext(
  days: string[],
  weather: Map<string, { code: number; tempMax: number; tempMin: number }>,
  holidays: Map<string, string>,
  events: Map<string, { name: string; category: string; distanceKm: number }[]>,
): DayContextRow[] {
  return days.map((day) => {
    const w = weather.get(day);
    return {
      day,
      weekday: weekdayOf(day),
      weatherCode: w ? w.code : null,
      tempMax: w ? w.tempMax : null,
      tempMin: w ? w.tempMin : null,
      holiday: holidays.get(day) ?? null,
      events: events.get(day) ?? [],
    };
  });
}
