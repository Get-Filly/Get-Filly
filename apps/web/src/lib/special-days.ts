// ============================================================
// special-days.ts, NL-feestdagen + commerciële dagen
// ============================================================
// Universele lijst (niet per-restaurant configureerbaar in v1).
// Bevat zowel officiële feestdagen als commercieel relevante dagen
// die voor horeca een campagne-aanleiding zijn (Vaderdag, Halloween).
//
// Variabele datums (Pasen-gerelateerd, Moederdag, Vaderdag) worden
// berekend per jaar zodat de lijst meegaat in de tijd zonder hand-
// matig onderhoud.

export type SpecialDay = {
  // ISO-datum (YYYY-MM-DD) van de feestdag in het opgegeven jaar.
  date: string;
  // NL-naam zoals getoond in UI + meegegeven aan Filly.
  name: string;
  // Emoji voor in de strook + popover. Helpt visueel scannen.
  emoji: string;
};

// ------------------------------------------------------------
// Easter Sunday-algoritme (Gauss / Anonymous-formule)
// ------------------------------------------------------------
// Werkt voor alle jaren in de Gregoriaanse kalender. Bron:
// https://en.wikipedia.org/wiki/Date_of_Easter#Anonymous_Gregorian_algorithm
// Retourneert een Date in LOCAL-tijdzone (12:00 om DST-grenzen te
// vermijden).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mrt, 4=apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0);
}

// Helper: voeg N dagen toe en formatteer als YYYY-MM-DD.
function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(base.getDate() + days);
  return toIsoDate(d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Nth-voorkomen van een weekdag in een maand. dayOfWeek: 0=zondag.
// occurrence: 1=eerste, 2=tweede, ... Voor Moederdag (2e zo mei) en
// Vaderdag (3e zo juni) hebben we deze nodig.
function nthWeekdayOfMonth(
  year: number,
  monthZero: number,
  dayOfWeek: number,
  occurrence: number,
): string {
  // Eerste van de maand op 12:00 (DST-veilig).
  const firstOfMonth = new Date(year, monthZero, 1, 12, 0, 0);
  const firstDow = firstOfMonth.getDay();
  // Offset naar de eerste gewenste weekdag (0-6 dagen vooruit).
  const offsetToFirstTargetDow = (dayOfWeek - firstDow + 7) % 7;
  // Daarna (occurrence-1) volle weken erbij.
  const day = 1 + offsetToFirstTargetDow + (occurrence - 1) * 7;
  return toIsoDate(new Date(year, monthZero, day, 12, 0, 0));
}

// ------------------------------------------------------------
// Hoofd-functie: alle NL-feestdagen voor een gegeven jaar
// ------------------------------------------------------------
// Volgorde van de array maakt niet uit, UI sorteert op datum.
export function getSpecialDays(year: number): SpecialDay[] {
  const easter = easterSunday(year);

  return [
    { date: `${year}-02-14`, name: "Valentijnsdag", emoji: "💌" },
    { date: toIsoDate(easter), name: "1e Paasdag", emoji: "🥚" },
    { date: addDays(easter, 1), name: "2e Paasdag", emoji: "🥚" },
    { date: `${year}-04-27`, name: "Koningsdag", emoji: "🇳🇱" },
    { date: `${year}-05-04`, name: "Dodenherdenking", emoji: "🕯️" },
    { date: `${year}-05-05`, name: "Bevrijdingsdag", emoji: "🕊️" },
    { date: nthWeekdayOfMonth(year, 4, 0, 2), name: "Moederdag", emoji: "💐" },
    { date: addDays(easter, 39), name: "Hemelvaartsdag", emoji: "🕊️" },
    { date: addDays(easter, 49), name: "1e Pinksterdag", emoji: "🔥" },
    { date: addDays(easter, 50), name: "2e Pinksterdag", emoji: "🔥" },
    { date: nthWeekdayOfMonth(year, 5, 0, 3), name: "Vaderdag", emoji: "👔" },
    { date: `${year}-10-31`, name: "Halloween", emoji: "🎃" },
    { date: `${year}-12-05`, name: "Sinterklaas", emoji: "🎁" },
    { date: `${year}-12-25`, name: "1e Kerstdag", emoji: "🎄" },
    { date: `${year}-12-26`, name: "2e Kerstdag", emoji: "🎄" },
    { date: `${year}-12-31`, name: "Oud & Nieuw", emoji: "🎆" },
  ];
}

// ------------------------------------------------------------
// Window-filter: speciale dagen binnen N weken vooruit
// ------------------------------------------------------------
// Pakt automatisch het juiste jaar (en het volgende als het venster
// over jaargrens valt, bv. eind december → januari Valentijn niet
// maar wel als 'ie binnen N weken zit).
export function getUpcomingSpecialDays(
  fromDate: Date,
  weeksAhead: number,
): SpecialDay[] {
  const fromIso = toIsoDate(fromDate);
  const cutoff = new Date(fromDate);
  cutoff.setDate(fromDate.getDate() + weeksAhead * 7);
  const cutoffIso = toIsoDate(cutoff);

  // Dit jaar + volgend jaar mengen, dan filteren op window.
  // Voorkomt edge-case rond december/januari waar je anders het
  // nieuwe jaar zou missen.
  const merged = [
    ...getSpecialDays(fromDate.getFullYear()),
    ...getSpecialDays(fromDate.getFullYear() + 1),
  ];

  return merged
    .filter((d) => d.date > fromIso && d.date <= cutoffIso)
    .sort((a, b) => a.date.localeCompare(b.date));
}
