// ============================================================
// Openingstijden-mapping Get-Filly <-> Google Bedrijfsprofiel
// ============================================================
// Get-Filly bewaart per zaak `opening_hours` als { mon: {open, close} | null,
// ... } (sleutels mon..sun, 'HH:MM'). De Google-kant werkt met DayHours
// (MONDAY..SUNDAY + open-vlag). Deze twee pure functies vertalen heen en
// weer, zodat een wijziging aan één kant op de andere kant kan landen.

export type GbpWeekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type GbpDayHours = {
  day: GbpWeekday;
  open: boolean;
  openTime: string;
  closeTime: string;
};

export type BusinessOpeningHours = Record<
  string,
  { open: string; close: string } | null | undefined
>;

// Volgorde = de volgorde waarin Google/de UI de week tonen.
const DAY_MAP: Array<{ key: string; day: GbpWeekday }> = [
  { key: 'mon', day: 'MONDAY' },
  { key: 'tue', day: 'TUESDAY' },
  { key: 'wed', day: 'WEDNESDAY' },
  { key: 'thu', day: 'THURSDAY' },
  { key: 'fri', day: 'FRIDAY' },
  { key: 'sat', day: 'SATURDAY' },
  { key: 'sun', day: 'SUNDAY' },
];

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Get-Filly -> Google. Geeft null terug als de tijden niet veilig naar
 * Google te schrijven zijn: een ontbrekende dag (zou anders als "gesloten"
 * Google overschrijven) of een tijd die geen geldige 'HH:MM' is.
 */
export function businessHoursToGbpDays(
  hours: BusinessOpeningHours | null | undefined,
): GbpDayHours[] | null {
  if (!hours) return null;
  const days: GbpDayHours[] = [];
  for (const { key, day } of DAY_MAP) {
    const dv = hours[key];
    if (dv === undefined) return null; // dag ontbreekt: niet gokken
    if (dv === null) {
      days.push({ day, open: false, openTime: '09:00', closeTime: '17:00' });
      continue;
    }
    if (!HH_MM.test(dv.open) || !HH_MM.test(dv.close)) return null;
    days.push({ day, open: true, openTime: dv.open, closeTime: dv.close });
  }
  return days;
}

/** Google -> Get-Filly: dezelfde vorm als de openingstijden-editor op /account. */
export function gbpDaysToBusinessHours(
  days: GbpDayHours[],
): Record<string, { open: string; close: string } | null> {
  const out: Record<string, { open: string; close: string } | null> = {};
  for (const { key, day } of DAY_MAP) {
    const d = days.find((x) => x.day === day);
    out[key] =
      d && d.open ? { open: d.openTime, close: d.closeTime } : null;
  }
  return out;
}

/** Vergelijkt twee JSON-waarden op inhoud (sleutelvolgorde maakt niet uit). */
export function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, val]) => [k, norm(val)]),
          )
        : v;
  return JSON.stringify(norm(a ?? null)) === JSON.stringify(norm(b ?? null));
}
