// ============================================================
// outscraper.parser.ts — Outscraper-response -> ons drukte-model
// ============================================================
// Pure omzetting (geen IO), zodat 'm makkelijk te testen valt tegen een
// echte pull (zie outscraper.parser.spec.ts + de Bar Barolo-fixture).
//
// De exacte responsvorm (bevestigd met een echte NL-pull, 2026-07-15):
//   popular_times = array van dag-objecten
//     { day: 1..7, day_text: "Monday", popular_times: [ {hour, percentage, title, time}, ... ] }
//   Dag-nummering:  1=maandag .. 6=zaterdag, 7=zondag  -> onze index = day-1.
//   Uur-entries:    alleen uur 6..23 (18 stuks); uren 0..5 ontbreken -> 0.
//   Live-drukte:    LAATSTE element { day: "live", percentage, title, time }
//                   (time = huidig uur; er staat GEEN dag bij).
// working_hours = { "Monday": ["12:15pm-12am"], ... }  (12u am/pm-notatie).

/** 7x24 drukte-raster: [dag][uur], 0=maandag..6=zondag, uur 0..23, waarde 0-100. */
export type BusynessPattern = number[][];

export interface ParsedPopularTimes {
  // Verwacht weekpatroon (Google's gemiddelde). null als de zaak geen
  // populaire tijden heeft -> caller valt terug op de seed.
  pattern: BusynessPattern | null;
  // Live "nu"-drukte, indien Google die meegaf.
  livePct: number | null;
  // Uur (0-23) dat Google als "nu" opgaf. De WEEKDAG leidt de cron zelf
  // af uit het scrapemoment (Europe/Amsterdam) — die zit niet in de data.
  liveHour: number | null;
}

/** doel-vorm van restaurants.opening_hours: per dagsleutel open/close of null (dicht). */
export type OpeningHours = Record<string, { open: string; close: string } | null>;

const clampPct = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const emptyPattern = (): BusynessPattern =>
  Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

/** Accepteert zowel een JSON-string (uit xlsx/CSV) als een al-geparsed array (JSON-API). */
function coerceArray(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    try {
      const parsed: unknown = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Zet Outscraper's popular_times om naar ons 7x24 patroon + live-drukte.
 * Ontbrekende uren blijven 0. Geen bruikbare dag-data -> pattern = null.
 */
export function parsePopularTimes(input: unknown): ParsedPopularTimes {
  const arr = coerceArray(input);
  if (!arr) return { pattern: null, livePct: null, liveHour: null };

  const pattern = emptyPattern();
  let livePct: number | null = null;
  let liveHour: number | null = null;
  let sawDay = false;

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const el = raw as Record<string, unknown>;

    // Live-element: { day: "live", percentage, time }.
    if (el.day === 'live') {
      if (el.percentage !== undefined && el.percentage !== null) {
        livePct = clampPct(el.percentage);
      }
      const t = typeof el.time === 'number' ? el.time : Number(el.time);
      if (Number.isInteger(t) && t >= 0 && t <= 23) liveHour = t;
      continue;
    }

    // Dag-element: day 1..7 (1=ma .. 7=zo) -> index day-1.
    const dayNum = typeof el.day === 'number' ? el.day : Number(el.day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) continue;
    const idx = dayNum - 1;

    const hours = el.popular_times;
    if (!Array.isArray(hours)) continue;
    sawDay = true;

    for (const slotRaw of hours) {
      if (!slotRaw || typeof slotRaw !== 'object') continue;
      const slot = slotRaw as Record<string, unknown>;
      const h = typeof slot.hour === 'number' ? slot.hour : Number(slot.hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) continue;
      pattern[idx][h] = clampPct(slot.percentage);
    }
  }

  return { pattern: sawDay ? pattern : null, livePct, liveHour };
}

// ------------------------------------------------------------
// working_hours -> opening_hours
// ------------------------------------------------------------

const WH_DAY_KEY: Record<string, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
};

/** "12:15pm" -> "12:15", "9am" -> "09:00", "12am" -> "00:00" (middernacht). */
function to24h(raw: string): string | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h === 12) h = 0; // 12am -> 0; 12pm wordt hieronder weer 12
  if (m[3] === 'pm') h += 12;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Zet Outscraper's working_hours om naar onze opening_hours-vorm.
 * Onbekende dagen/gesloten dagen worden null. Geen bruikbare data -> null.
 */
export function parseWorkingHours(input: unknown): OpeningHours | null {
  let obj: unknown = input;
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    try {
      obj = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const out: OpeningHours = {};
  let any = false;
  for (const [dayName, val] of Object.entries(obj as Record<string, unknown>)) {
    const key = WH_DAY_KEY[dayName.toLowerCase()];
    if (!key) continue;
    any = true;

    // val = ["12:15pm-12am"] | [] (gesloten) | "Closed"
    const first = Array.isArray(val) ? val[0] : val;
    if (typeof first !== 'string' || !first.includes('-')) {
      out[key] = null;
      continue;
    }
    const dash = first.indexOf('-');
    const open = to24h(first.slice(0, dash));
    const close = to24h(first.slice(dash + 1));
    out[key] = open && close ? { open, close } : null;
  }
  return any ? out : null;
}
