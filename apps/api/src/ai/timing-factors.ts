/**
 * ============================================================
 * Externe timing-factoren — deterministisch berekend
 * ============================================================
 *
 * Vertaalt hoofdstuk 4 van het social-posting-brein-document
 * (`docs/social-posting-brein.docx`): weer, NL-feestdagen,
 * loondagen en seizoenen passen de basis-timing per kanaal aan.
 *
 * Bewuste keuze: dit wordt in códe berekend, niet aan Claude
 * gevraagd. Feestdagen en loondagen zijn 100% voorspelbaar; een
 * LLM laten rekenen aan "wanneer is 2e Pinksterdag" is duurder
 * én foutgevoeliger. Alleen het resultaat ("Koningsdag over 12
 * dagen, start promotie nu") gaat de prompt in. De weer-REGELS
 * zijn wel tekst voor Claude: de live weerdata zit al in het
 * live-blok van de prompt, Claude past de regels daarop toe.
 *
 * Bronnen (zie het doc voor de volledige onderbouwing): Rabobank
 * feestdagen-omzetanalyse 2024, FNV Horeca loondagen, ABN AMRO
 * seizoenspatronen, Ohio State University weer-impact-studies.
 */

// ============================================================
// Feestdagen
// ============================================================

export type NlHoliday = {
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  name: string;
  /** Omzet-impact + advies, gaat letterlijk de prompt in. */
  impact: string;
  /** Hoeveel dagen vóór de feestdag de promotie moet starten. */
  promoLeadDays: number;
  /** true = negatieve omzetdag, NIET actief promoten. */
  avoid?: boolean;
};

// Paaszondag via het anonieme Gregoriaanse algoritme (Meeus).
// Alle beweegbare christelijke feestdagen hangen hieraan.
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = maart
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** n-de weekdag van een maand, bv. 2e zondag van mei (Moederdag). */
function nthWeekdayOfMonth(
  year: number,
  month: number, // 1-12
  weekday: number, // 0 = zondag ... 6 = zaterdag (Date.getUTCDay)
  n: number,
): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

/**
 * Alle horeca-relevante NL-feestdagen voor een jaar, met de
 * omzet-impact en promotie-lead-time uit het Timing Brein-doc
 * (Rabobank 2024 + KHN-branchedata).
 */
export function getNlHolidays(year: number): NlHoliday[] {
  const easter = easterSunday(year);

  // Koningsdag: 27 april, tenzij dat een zondag is → 26 april.
  const kd = new Date(Date.UTC(year, 3, 27));
  const koningsdag = kd.getUTCDay() === 0 ? new Date(Date.UTC(year, 3, 26)) : kd;

  const holidays: NlHoliday[] = [
    {
      date: toIso(new Date(Date.UTC(year, 1, 14))),
      name: 'Valentijnsdag',
      impact:
        '+35% weekomzet, #1 commerciële restaurantdag. Meeste zaken zitten 7 dagen vooraf vol.',
      promoLeadDays: 21,
    },
    {
      date: toIso(addDays(easter, -2)),
      name: 'Goede Vrijdag',
      impact:
        '-10% weekomzet (gasten thuis/religieuze observatie). NIET actief promoten.',
      promoLeadDays: 0,
      avoid: true,
    },
    {
      date: toIso(easter),
      name: '1e Paasdag',
      impact: '-10% weekomzet. NIET actief promoten; richt je op 2e Paasdag.',
      promoLeadDays: 0,
      avoid: true,
    },
    {
      date: toIso(addDays(easter, 1)),
      name: '2e Paasdag',
      impact: '+6% weekomzet. Dé paasdag om actief te pushen (niet de 1e).',
      promoLeadDays: 10,
    },
    {
      date: toIso(koningsdag),
      name: 'Koningsdag',
      impact:
        '+21% weekomzet — grootste feestdag-effect in NL. Start 14 dagen vooraf, top-up 3 dagen vooraf, reminder op de dag zelf.',
      promoLeadDays: 14,
    },
    {
      date: toIso(new Date(Date.UTC(year, 4, 5))),
      name: 'Bevrijdingsdag',
      impact:
        '+10% weekomzet, vooral rond festivals. Positioneer als "pre-festival diner" bij events in de buurt.',
      promoLeadDays: 10,
    },
    {
      date: toIso(nthWeekdayOfMonth(year, 5, 0, 2)),
      name: 'Moederdag',
      impact:
        'Lunch-piek, ~+30% omzet die zondag. Grote familie-tafels: stuur op vroeg reserveren.',
      promoLeadDays: 14,
    },
    {
      date: toIso(addDays(easter, 39)),
      name: 'Hemelvaartsdag',
      impact:
        '+7% weekomzet. Lang weekend triggert "lange lunch"-cultuur; lunch-content extra belangrijk.',
      promoLeadDays: 10,
    },
    {
      date: toIso(addDays(easter, 49)),
      name: '1e Pinksterdag',
      impact: '+12% weekomzet — op één na grootste feestdag-effect.',
      promoLeadDays: 10,
    },
    {
      date: toIso(addDays(easter, 50)),
      name: '2e Pinksterdag',
      impact: '+7% weekomzet. Vrije dag, populair voor dineren.',
      promoLeadDays: 10,
    },
    {
      date: toIso(nthWeekdayOfMonth(year, 6, 0, 3)),
      name: 'Vaderdag',
      impact:
        'Familie-dinerdag analoog aan Moederdag (geen Rabobank-cijfer; branchekennis).',
      promoLeadDays: 14,
    },
    {
      date: toIso(new Date(Date.UTC(year, 11, 25))),
      name: '1e Kerstdag',
      impact:
        'Top-3 omzetdag van het jaar. Reserveringen zitten 4-6 weken vooraf vol; promotie start 8 weken vooraf.',
      promoLeadDays: 56,
    },
    {
      date: toIso(new Date(Date.UTC(year, 11, 26))),
      name: '2e Kerstdag',
      impact: 'Top-omzetdag; zelfde cyclus als 1e Kerstdag.',
      promoLeadDays: 56,
    },
    {
      date: toIso(new Date(Date.UTC(year, 11, 31))),
      name: 'Oudejaarsavond',
      impact:
        'Hoogste gemiddelde besteding per tafel van het jaar. Zelfde 8-weken-promotiecyclus als Kerst.',
      promoLeadDays: 56,
    },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// Loondagen + seizoen
// ============================================================

/**
 * Loondag-context voor een datum (hfst 4.4). NL betaalt maandsalaris
 * meestal rond de 25e of de laatste werkdag; begin van de maand is
 * de "verse paycheck"-periode. 4-wekelijks salaris heeft geen vaste
 * dag en wordt bewust genegeerd.
 */
export function salaryContext(date: Date): string | null {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // 1-12

  const parts: string[] = [];
  if (day >= 25) {
    parts.push(
      'Loondag-cluster actief (25e t/m einde maand): veel maandsalarissen worden nu uitbetaald — lichte bestedings-boost, goed moment voor promoties.',
    );
  } else if (day <= 5) {
    parts.push(
      'Begin van de maand (1-5): "verse paycheck"-periode, sterk voor premium-promoties.',
    );
  }
  if (month === 5 || month === 6) {
    parts.push(
      'Vakantiegeld-periode (mei-juni): 8% vakantiegeld komt binnen, ruimte voor luxere uit-eten-promoties.',
    );
  }
  if (month === 11 || month === 12) {
    parts.push(
      '13e-maand-periode (nov-dec): eindejaarsuitkeringen, combineer met de Kerst-promotiecyclus.',
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Seizoens-context (hfst 4.5, ABN AMRO/Rabobank-patronen). */
export function seasonContext(date: Date): string {
  const month = date.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) {
    return 'Voorjaar: de feestdagen clusteren hier (Pasen, Koningsdag, Hemelvaart, Pinksteren) — hoogste feestdag-omzetimpact van het jaar.';
  }
  if (month >= 6 && month <= 8) {
    return 'Zomer: hoogste horeca-bestedingen van het jaar (terras-cultuur, vakantie, festivals). Terras- en buitencontent prioriteit.';
  }
  if (month >= 9 && month <= 11) {
    return 'Najaar: stabilisatie na de zomer; herfst-thema\'s werken. Vanaf november de kerstdiner-promotie starten.';
  }
  return 'Winter: december piekt (Kerst/Oudjaar); januari-februari zijn de rustigste maanden ("januari-dip") — activatie-campagnes wegen dan extra zwaar.';
}

// ============================================================
// Weer-regels (statisch — Claude past ze toe op het live-weerblok)
// ============================================================

export const WEATHER_TIMING_RULES = `WEER-REGELS (pas toe op de actuele weerdata uit het live-blok; temperatuur weegt zwaarder dan regen voor restaurant-omzet):
- Temperatuur >22°C → terras-content pushen op Instagram/Facebook, ~2u vóór lunch of ~4u vóór diner.
- Regen verwacht → "cozy indoor"/comfort-food-messaging; géén terras-promoties.
- Hittegolf (>30°C) → restaurantbezoek dáált (mensen blijven binnen); benadruk koeling/airco of delivery.
- Storm/onweer → geen actieve promoties plannen; hooguit wijzen op delivery/takeaway.
- Eerste warme dag van het seizoen → "eerste terrasdag" is een cultureel moment in NL: 2-3 dagen vooraf communiceren.
- Mooie zondag in lente/zomer → spontaan dineren piekt: "last-minute tafels vrij" via WhatsApp + Instagram Stories.`;

// ============================================================
// Prompt-blok-bouwer
// ============================================================

/**
 * Bouwt het complete EXTERNE TIMING-FACTOREN-blok voor injectie in
 * een system-prompt. Feestdagen worden meegenomen als (a) ze binnen
 * `horizonDays` vallen, of (b) hun promotie-window al open is (Kerst
 * verschijnt dus al 8 weken vooraf). Alles deterministisch; Claude
 * hoeft alleen nog te kiezen wát hij ermee doet.
 */
export function buildExternalFactorsBlock(
  today: Date = new Date(),
  horizonDays = 21,
): string {
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const todayIso = toIso(todayUtc);

  // Jaargrens: in december zijn de feestdagen van volgend jaar
  // (Valentijn over <90 dagen) al relevant voor de promotie-window.
  const candidates = [
    ...getNlHolidays(todayUtc.getUTCFullYear()),
    ...getNlHolidays(todayUtc.getUTCFullYear() + 1),
  ];

  const dayNames = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const upcoming = candidates
    .map((h) => {
      const daysUntil = Math.round(
        (Date.parse(h.date) - todayUtc.getTime()) / 86_400_000,
      );
      return { ...h, daysUntil };
    })
    .filter(
      (h) =>
        h.daysUntil >= 0 &&
        h.daysUntil <= Math.max(horizonDays, h.promoLeadDays),
    );

  const lines: string[] = [];
  lines.push(
    `EXTERNE TIMING-FACTOREN (deterministisch berekend, vandaag = ${todayIso}):`,
  );

  if (upcoming.length > 0) {
    lines.push('');
    lines.push('Feestdagen in beeld:');
    for (const h of upcoming) {
      const weekday = dayNames[new Date(Date.parse(h.date)).getUTCDay()];
      const windowOpen = h.daysUntil <= h.promoLeadDays;
      const promoNote = h.avoid
        ? ''
        : windowOpen
          ? ' Promotie-window is NU open.'
          : ` Promotie start over ${h.daysUntil - h.promoLeadDays} dagen (lead ${h.promoLeadDays}d).`;
      lines.push(
        `- ${h.name} (${weekday} ${h.date}, over ${h.daysUntil} dagen): ${h.impact}${promoNote}`,
      );
    }
  } else {
    lines.push('');
    lines.push('Feestdagen in beeld: geen binnen de planningshorizon.');
  }

  const salary = salaryContext(todayUtc);
  lines.push('');
  lines.push(`Bestedings-context: ${salary ?? 'geen loondag-effect actief.'}`);
  lines.push(`Seizoen: ${seasonContext(todayUtc)}`);
  lines.push('');
  lines.push(WEATHER_TIMING_RULES);

  return lines.join('\n');
}
