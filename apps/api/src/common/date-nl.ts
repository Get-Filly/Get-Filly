// ============================================================
// Datum-helpers in Europe/Amsterdam-tijdzone
// ============================================================
//
// Waarom dit bestaat: onze API draait op Vercel in UTC, maar de
// klanten zitten in Nederland (UTC+1 winter / UTC+2 zomer). Wie
// `new Date().toISOString()` voor "vandaag" gebruikt, krijgt rond
// middernacht NL-tijd de VERKEERDE dag terug — tussen 00:00 en 02:00
// NL-tijd is het in UTC nog "gisteren". Dat brak de KPI "Bezetting
// vandaag" (today_pct vond geen matchende occupancy_days-rij → null
// → "—" in de UI).
//
// Bovendien is `new Date(year, month, 1)` server-lokaal (UTC op
// Vercel), terwijl `now.getMonth()` óók server-lokaal is — die
// combinatie lijkt te kloppen op een UTC-server maar is fragiel zodra
// de server-tijdzone wijzigt. Deze helpers rekenen ALTIJD expliciet
// in Europe/Amsterdam zodat het gedrag onafhankelijk is van waar de
// server draait.

const AMSTERDAM = 'Europe/Amsterdam';

/**
 * De datum-onderdelen (jaar, 0-indexed maand, dag) van een tijdstip
 * zoals het in Nederland geldt. Gebruikt Intl met expliciete tijdzone
 * zodat de server-tijdzone er niet toe doet.
 */
export function amsterdamParts(d: Date = new Date()): {
  year: number;
  month: number; // 0-indexed, net als Date.getMonth()
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const val = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: val('year'),
    month: val('month') - 1,
    day: val('day'),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Bouwt een `YYYY-MM-DD`-string uit losse onderdelen. month is
 * 0-indexed; overflow/underflow wordt genormaliseerd (bv. month=-2
 * rolt terug naar het vorige jaar, day=0 geeft de laatste dag van de
 * vorige maand). Rekent volledig in UTC zodat er geen tijdzone-drift
 * in de normalisatie sluipt — we gebruiken de string puur als
 * kalenderdatum, niet als tijdstip.
 */
export function ymd(year: number, month: number, day: number): string {
  const norm = new Date(Date.UTC(year, month, day));
  return `${norm.getUTCFullYear()}-${pad2(norm.getUTCMonth() + 1)}-${pad2(
    norm.getUTCDate(),
  )}`;
}

/** `YYYY-MM-DD` van vandaag in Nederland. */
export function todayNl(d: Date = new Date()): string {
  const { year, month, day } = amsterdamParts(d);
  return ymd(year, month, day);
}
