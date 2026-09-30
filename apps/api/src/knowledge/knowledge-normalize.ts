import type { ImportMapping, NormalizeResult } from './knowledge.types';

const CHANNEL_SYNONYMS: Record<string, string> = {
  instagram: 'instagram',
  ig: 'instagram',
  insta: 'instagram',
  facebook: 'facebook',
  fb: 'facebook',
  meta: 'facebook',
  tiktok: 'tiktok',
  'tik tok': 'tiktok',
  google: 'google_business',
  gbp: 'google_business',
  'google business': 'google_business',
  'google business profile': 'google_business',
  'google bedrijfsprofiel': 'google_business',
  'google maps': 'google_business',
};

const FORMAT_SYNONYMS: Record<string, string> = {
  carousel: 'carrousel',
  carrousel: 'carrousel',
  reel: 'reel',
  reels: 'reel',
  'short video': 'reel',
  image: 'foto',
  photo: 'foto',
  foto: 'foto',
  'single image': 'foto',
  video: 'video',
  story: 'story',
  stories: 'story',
  text: 'tekst',
  tekst: 'tekst',
  link: 'tekst',
};

export function normalizeChannel(raw: unknown): string | null {
  if (raw == null) return null;
  return CHANNEL_SYNONYMS[String(raw).trim().toLowerCase()] ?? null;
}

export function normalizeFormat(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const key = String(raw).trim().toLowerCase();
  return FORMAT_SYNONYMS[key] ?? key.replace(/\s+/g, '_');
}

/** "1.234,5" (nl) of "1,234.5" (en) of "12%" naar een getal; anders null. */
export function parseNumber(raw: unknown, locale: 'nl' | 'en' = 'en'): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[%\s]/g, '');
  if (s === '') return null;
  s = locale === 'nl' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const WEEKDAYS: Record<string, number> = {
  maandag: 0, monday: 0, mon: 0, ma: 0,
  dinsdag: 1, tuesday: 1, tue: 1, di: 1,
  woensdag: 2, wednesday: 2, wed: 2, wo: 2,
  donderdag: 3, thursday: 3, thu: 3, do: 3,
  vrijdag: 4, friday: 4, fri: 4, vr: 4,
  zaterdag: 5, saturday: 5, sat: 5, za: 5,
  zondag: 6, sunday: 6, sun: 6, zo: 6,
};

function parseWeekday(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s in WEEKDAYS) return WEEKDAYS[s];
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

function parseDate(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Zet ruwe rijen (uit csv of json) om naar metingen volgens de mapping.
 * Rijen die niet te gebruiken zijn worden geteld met reden, niet stilzwijgend
 * weggegooid, zodat een verkeerde mapping meteen opvalt.
 */
export function normalizeRows(
  rows: Record<string, unknown>[],
  mapping: ImportMapping,
): NormalizeResult {
  const out: NormalizeResult = { observations: [], skipped: 0, reasons: {} };
  const skip = (reason: string) => {
    out.skipped += 1;
    out.reasons[reason] = (out.reasons[reason] ?? 0) + 1;
  };

  const pick = (row: Record<string, unknown>, key: keyof ImportMapping['fields']) => {
    const spec = mapping.fields[key];
    if (!spec) return undefined;
    const column = typeof spec === 'string' ? spec : spec.column;
    const value = row[column];
    if (typeof spec !== 'string' && spec.map && value != null) {
      const mapped = spec.map[String(value)];
      if (mapped !== undefined) return mapped;
    }
    return value;
  };
  const text = (row: Record<string, unknown>, key: keyof ImportMapping['fields'], constant?: string) => {
    const v = pick(row, key);
    const s = v == null || String(v).trim() === '' ? constant : String(v).trim();
    return s ? s.toLowerCase() : null;
  };
  const c = mapping.constants ?? {};

  for (const row of rows) {
    const channel = normalizeChannel(pick(row, 'channel') ?? c.channel);
    if (!channel) {
      skip('kanaal onbekend');
      continue;
    }
    const value = parseNumber(pick(row, 'value'), mapping.numberLocale);
    if (value == null) {
      skip('waarde ontbreekt');
      continue;
    }
    const metric = text(row, 'metric', c.metric);
    if (!metric) {
      skip('meetwaarde ontbreekt');
      continue;
    }
    const sample = parseNumber(pick(row, 'sampleSize'), mapping.numberLocale);
    out.observations.push({
      channel,
      format: normalizeFormat(pick(row, 'format') ?? c.format),
      topic: text(row, 'topic', c.topic),
      country: text(row, 'country', c.country),
      region: text(row, 'region', c.region),
      weekday: parseWeekday(pick(row, 'weekday')),
      daypart: text(row, 'daypart', c.daypart),
      season: text(row, 'season', c.season),
      metric,
      unit: text(row, 'unit', c.unit),
      value,
      sampleSize: sample != null && sample > 0 ? Math.round(sample) : null,
      periodEnd: parseDate(pick(row, 'periodEnd')),
    });
  }
  return out;
}
