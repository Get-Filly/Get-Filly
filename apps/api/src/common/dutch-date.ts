import { getNlHolidays } from '../ai/timing-factors';

// ============================================================
// resolveDutchDate — relatieve NL-datum-frase → ISO (YYYY-MM-DD)
// ============================================================
//
// Audit-item #2: het omrekenen van "volgende week zondag" / "morgen"
// hoort NIET bij het LLM (foutgevoelig, stille verkeerde-dag-fout).
// Het LLM levert alleen de frase zoals de eigenaar 'm noemde; deze
// pure functie rekent 'm deterministisch om t.o.v. "vandaag".
//
// Werkt in Europe/Amsterdam: we bepalen eerst de NL-kalenderdag van
// `today` en ankeren alle rekenwerk op 12:00 UTC van die dag, zodat
// dag-grenzen en weekdagen niet door tijdzone/DST verschuiven.
//
// Retourneert null als de frase niet (betrouwbaar) te herleiden is —
// de caller laat de geleide flow dan zelf de dag vragen.

const WEEKDAYS: Record<string, number> = {
  // getUTCDay: zo=0, ma=1, ... za=6
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
};

const MONTHS: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maart: 3, mrt: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  augustus: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Feestdag-trefwoord → exacte naam in getNlHolidays. Volgorde telt:
// langere/specifiekere trefwoorden eerst (tweede kerstdag vóór kerst).
const HOLIDAY_KEYWORDS: Array<[string, string]> = [
  ['tweede kerstdag', '2e Kerstdag'],
  ['2e kerstdag', '2e Kerstdag'],
  ['eerste kerstdag', '1e Kerstdag'],
  ['1e kerstdag', '1e Kerstdag'],
  ['kerstmis', '1e Kerstdag'],
  ['kerst', '1e Kerstdag'],
  ['oudejaars', 'Oudejaarsavond'],
  ['oudjaar', 'Oudejaarsavond'],
  ['oud en nieuw', 'Oudejaarsavond'],
  ['vaderdag', 'Vaderdag'],
  ['moederdag', 'Moederdag'],
  ['koningsdag', 'Koningsdag'],
  ['valentijn', 'Valentijnsdag'],
  ['bevrijdingsdag', 'Bevrijdingsdag'],
  ['hemelvaart', 'Hemelvaartsdag'],
  ['tweede pinksterdag', '2e Pinksterdag'],
  ['2e pinksterdag', '2e Pinksterdag'],
  ['pinksteren', '1e Pinksterdag'],
  ['tweede paasdag', '2e Paasdag'],
  ['2e paasdag', '2e Paasdag'],
  ['pasen', '1e Paasdag'],
];

function amsterdamAnchor(today: Date): Date {
  const ymd = today.toLocaleDateString('en-CA', {
    timeZone: 'Europe/Amsterdam',
  });
  return new Date(`${ymd}T12:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(anchor: Date, days: number): Date {
  const c = new Date(anchor.getTime());
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}

// Eerstvolgende voorkomen van een weekdag (vandaag telt mee bij 0).
function nextWeekday(anchor: Date, targetDow: number): Date {
  const diff = (targetDow - anchor.getUTCDay() + 7) % 7;
  return addDays(anchor, diff);
}

// Weekdag in de VOLGENDE kalenderweek (weken starten op maandag).
function weekdayNextWeek(anchor: Date, targetDow: number): Date {
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  const mondayNextWeek = addDays(anchor, 7 - daysSinceMonday);
  const offsetFromMonday = (targetDow + 6) % 7;
  return addDays(mondayNextWeek, offsetFromMonday);
}

export function resolveDutchDate(
  phrase: string,
  today: Date = new Date(),
): string | null {
  if (!phrase) return null;
  const anchor = amsterdamAnchor(today);
  // Normaliseer: lowercase, diacritics weg, spaties samen.
  const p = phrase
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Vaste relatieve woorden (overmorgen vóór morgen!).
  if (p.includes('vandaag')) return toIso(anchor);
  if (p.includes('overmorgen')) return toIso(addDays(anchor, 2));
  if (p.includes('morgen')) return toIso(addDays(anchor, 1));

  // 2. Feestdagen (eerstvolgende voorkomen, dit of volgend jaar).
  for (const [kw, name] of HOLIDAY_KEYWORDS) {
    if (p.includes(kw)) {
      const todayIso = toIso(anchor);
      const candidates = [
        ...getNlHolidays(anchor.getUTCFullYear()),
        ...getNlHolidays(anchor.getUTCFullYear() + 1),
      ]
        .filter((h) => h.name === name && h.date >= todayIso)
        .sort((a, b) => a.date.localeCompare(b.date));
      return candidates[0]?.date ?? null;
    }
  }

  // 3. "DD maand [jaar]" — bv. "20 juni" of "3 mei 2027".
  const dm = p.match(
    /\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\b/,
  );
  if (dm && MONTHS[dm[2]]) {
    const day = parseInt(dm[1], 10);
    const month = MONTHS[dm[2]];
    if (day >= 1 && day <= 31) {
      let year = dm[3] ? parseInt(dm[3], 10) : anchor.getUTCFullYear();
      let candidate = new Date(
        Date.UTC(year, month - 1, day, 12, 0, 0),
      );
      // Jaar weggelaten + datum al voorbij → volgend jaar.
      if (!dm[3] && toIso(candidate) < toIso(anchor)) {
        year += 1;
        candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      }
      // Sanity: bv. 31 februari → ongeldig (maand verschoven).
      if (candidate.getUTCMonth() === month - 1) return toIso(candidate);
    }
  }

  // 4. Weekend.
  if (p.includes('weekend')) {
    return toIso(nextWeekday(anchor, 6)); // eerstvolgende zaterdag
  }

  // 5. Weekdagen — "volgende week <dag>" vóór de kale weekdag.
  const isNextWeek = /\bvolgende\s+week\b/.test(p);
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (p.includes(name)) {
      return toIso(
        isNextWeek ? weekdayNextWeek(anchor, dow) : nextWeekday(anchor, dow),
      );
    }
  }
  // "volgende week" zonder weekdag → aanstaande maandag.
  if (isNextWeek) return toIso(weekdayNextWeek(anchor, 1));

  return null;
}
