// ============================================================
// apify.parser.ts — Apify-response -> ons drukte-model
// ============================================================
// Bron = Apify actor `compass/crawler-google-places` (met "Scrape place
// detail page" aan). VERVANGT Outscraper: Apify scrapet echt vers, dus de
// live-drukte klopt (Outscraper cachete een bevroren waarde).
//
// Responsvorm (bevestigd met echte Bar Barolo-pulls, 2026-07-16):
//   popularTimesHistogram = { "Mo": [ {hour, occupancyPercent}, ... ], "Tu": ..., "Su": ... }
//     dagen Mo/Tu/We/Th/Fr/Sa/Su ; uren 6-23 (0-5 ontbreken -> 0).
//   popularTimesLivePercent = getal 0-100  (of null als er geen live is)
//   popularTimesLiveText    = "Less busy than usual" / "Now: Usually not too busy"
//   openingHours = [ {day:"Monday", hours:"12:15 PM to 12 AM"}, ... ]
// Apify geeft GEEN live-uur; de cron leidt uur+weekdag af uit "nu".

/** 7x24 drukte-raster: [dag][uur], 0=maandag..6=zondag, uur 0-23, waarde 0-100. */
export type BusynessPattern = number[][];

/** doel-vorm van restaurants.opening_hours: per dagsleutel open/close of null (dicht). */
export type OpeningHours = Record<string, { open: string; close: string } | null>;

export interface ApifyPlace {
  placeId?: string;
  title?: string;
  popularTimesLivePercent?: number | null;
  popularTimesLiveText?: string | null;
  popularTimesHistogram?: Record<
    string,
    Array<{ hour: number; occupancyPercent: number }>
  > | null;
  openingHours?: Array<{ day: string; hours: string }> | null;
}

export interface ParsedApify {
  pattern: BusynessPattern | null; // 7x24 verwacht, null bij kleine zaak
  livePct: number | null; // live-drukte nu (null = geen live)
  openingHours: OpeningHours | null;
}

const clampPct = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const emptyPattern = (): BusynessPattern =>
  Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

// Apify-dagsleutel -> Monday-first index (0=ma..6=zo).
const DAY_INDEX: Record<string, number> = {
  Mo: 0,
  Tu: 1,
  We: 2,
  Th: 3,
  Fr: 4,
  Sa: 5,
  Su: 6,
};

function parseHistogram(
  h: ApifyPlace['popularTimesHistogram'],
): BusynessPattern | null {
  if (!h || typeof h !== 'object') return null;
  const pattern = emptyPattern();
  let saw = false;
  for (const [key, idx] of Object.entries(DAY_INDEX)) {
    const rows = h[key];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const hr = (r as { hour?: unknown }).hour;
      if (typeof hr !== 'number' || !Number.isInteger(hr) || hr < 0 || hr > 23) {
        continue;
      }
      pattern[idx][hr] = clampPct((r as { occupancyPercent?: unknown }).occupancyPercent);
      saw = true;
    }
  }
  return saw ? pattern : null;
}

// Volledige Engelse dagnaam -> onze dagsleutel.
const OH_DAY: Record<string, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
};

/** "12:15 PM" -> "12:15", "9 AM" -> "09:00", "12 AM" -> "00:00" (middernacht). */
function to24h(raw: string): string | null {
  const m = raw
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h === 12) h = 0; // 12 AM -> 0; 12 PM wordt hieronder weer 12
  if (m[3] === 'PM') h += 12;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseOpeningHours(
  arr: ApifyPlace['openingHours'],
): OpeningHours | null {
  if (!Array.isArray(arr)) return null;
  const out: OpeningHours = {};
  let any = false;
  for (const e of arr) {
    const key = OH_DAY[String(e?.day ?? '').toLowerCase()];
    if (!key) continue;
    any = true;
    const hours = String(e?.hours ?? '');
    if (/closed/i.test(hours)) {
      out[key] = null;
      continue;
    }
    if (/24\s*hours/i.test(hours)) {
      out[key] = { open: '00:00', close: '00:00' }; // 24u open
      continue;
    }
    const parts = hours.split(/\s+to\s+/i);
    if (parts.length !== 2) {
      out[key] = null;
      continue;
    }
    const open = to24h(parts[0]);
    const close = to24h(parts[1]);
    out[key] = open && close ? { open, close } : null;
  }
  return any ? out : null;
}

/** Zet één Apify-place om naar ons drukte-model. */
export function parseApifyPlace(place: ApifyPlace): ParsedApify {
  const p = place.popularTimesLivePercent;
  return {
    pattern: parseHistogram(place.popularTimesHistogram),
    // Een getal (ook 0) = echte live-meting; null = geen live.
    livePct: typeof p === 'number' ? clampPct(p) : null,
    openingHours: parseOpeningHours(place.openingHours),
  };
}
