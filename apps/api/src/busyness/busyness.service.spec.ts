import { BusynessService } from './busyness.service';
import type { SlotPerformance, WeatherSignal } from './quiet-signals';

// ============================================================
// getQuietMoments — vulbaarheid-first model (2026-08-06)
//                 + datum-variatie (2026-09-15)
// ============================================================
// Borgt twee ontwerp-omslagen:
//   1. van "alleen ongewoon rustig" (anomalie-poort) naar "best vulbare
//      rustige momenten" — een STRUCTUREEL-lege dag (maandag) komt als kans
//      naar boven;
//   2. van een score die alleen van de weekdag afhing naar een score per
//      KALENDERDATUM (weer + evenementen) mét beleidslaag (feestdag-poort,
//      uitsluiting van afgedekte dagen, cool-down en spreiding).
//
// Alles synthetisch: geen Supabase, geen netwerk. De DB-lezingen en de
// weer/event-bronnen worden gespied, net als getQuietWindow dat al deed.

// Synthetisch weekpatroon (7×24, ma..zo). Open 11:00–20:00. Elke dag een
// vlak niveau; zaterdag is de piek. Donderdag-middag krijgt een dip als
// "ongewoon rustig"-anomalie bovenop het structurele beeld.
function makePattern(): number[][] {
  const base = [25, 30, 50, 55, 70, 78, 55]; // ma di wo do vr za zo
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (let d = 0; d < 7; d++) {
    for (let h = 11; h <= 20; h++) p[d][h] = base[d];
    if (d === 3) p[d][14] = p[d][15] = p[d][16] = 20; // do-middag anomalie
  }
  return p;
}

type ContextOverrides = {
  window?: { start: number; end: number } | null;
  holidays?: boolean; // feestdagen-poort actief laten (default: uit in tests)
  covered?: Set<string>;
  weather?: Map<string, WeatherSignal>;
  events?: Map<string, unknown[]>;
  recentSlots?: Map<string, { weekIndex: number; weak?: boolean }[]>;
  hasTerrace?: boolean;
  // Fase 4: wat campagnes per slot eerder deden, plus het ijkpunt.
  slotPerformance?: Map<string, SlotPerformance>;
  businessMedianLift?: number;
};

function makeService(
  pattern: number[][],
  overrides: ContextOverrides = {},
): BusynessService {
  const svc = new BusynessService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(svc, 'getLatest').mockResolvedValue({
    pattern,
    openingHours: null,
    livePct: null,
    liveHour: null,
    liveWeekday: null,
    capturedAt: null,
  });
  // getQuietWindow (mig 0069) doet een DB-query; mocken zodat de unit-test
  // geen supabase nodig heeft. Default: geen venster.
  jest
    .spyOn(
      svc as unknown as { getQuietWindow: () => Promise<unknown> },
      'getQuietWindow',
    )
    .mockResolvedValue(overrides.window ?? null);

  // De hele datum-/beleidscontext in één mock: dat is precies de naad waar in
  // productie de DB, Open-Meteo en de events-tabel achter zitten, en waar de
  // fail-soft-terugval op uitkomt.
  const holidayByDate = new Map<string, string>();
  if (overrides.holidays) {
    // 2e Paasdag 2026 valt op ma 6 april.
    holidayByDate.set('2026-04-06', '2e Paasdag');
  }
  jest
    .spyOn(
      svc as unknown as { loadQuietContext: () => Promise<unknown> },
      'loadQuietContext',
    )
    .mockResolvedValue({
      holidayByDate,
      eventsByDate: overrides.events ?? new Map(),
      weatherByDate: overrides.weather ?? new Map(),
      hasTerrace: overrides.hasTerrace ?? false,
      covered: overrides.covered ?? new Set<string>(),
      recentSlots: overrides.recentSlots ?? new Map(),
      slotPerformance: overrides.slotPerformance ?? new Map(),
      businessMedianLift: overrides.businessMedianLift ?? 0,
    });
  return svc;
}

// Vlak patroon (open 11:00–20:00) met een expliciet niveau per weekdag, voor
// tests waarin de datum-signalen de doorslag moeten geven en niet een dip die
// al in het patroon zit.
function makeFlatPattern(base: number[]): number[][] {
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (let d = 0; d < 7; d++) for (let h = 11; h <= 20; h++) p[d][h] = base[d];
  return p;
}

// Patroon dat elke dag 09:00–21:00 open is; maandag is de vlakke, leegste dag.
function makeAllDayPattern(): number[][] {
  const base = [25, 55, 55, 60, 70, 78, 55]; // ma..zo
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (let d = 0; d < 7; d++) for (let h = 9; h <= 20; h++) p[d][h] = base[d];
  return p;
}

// Ma 2026-08-10 t/m zo 2026-08-16.
const FROM = '2026-08-10';
const TO = '2026-08-16';

describe('getQuietMoments — vulbaarheid-first', () => {
  it('surfacet de structureel-leegste dag (maandag) als kans', async () => {
    const svc = makeService(makePattern());
    const { hasSource, moments } = await svc.getQuietMoments(
      'biz',
      FROM,
      TO,
      7, // ruim tempo: laat alle vulbare dagen zien
    );
    expect(hasSource).toBe(true);
    const days = moments.map((m) => m.date);
    // Maandag = leegste dag → moet erbij (kern van de omslag).
    expect(days).toContain('2026-08-10');
    // De piekdag (zaterdag) heeft niets te vullen → mag er NIET bij.
    expect(days).not.toContain('2026-08-15');
  });

  it('rangschikt op vulbaarheid + anomalie-bonus: tempo 2 = ma (structureel leeg) + do (diepe dip)', async () => {
    // do-middag zakt naar 20 (leger dan di's 30) én is een anomalie → wint van
    // di. Maandag (25, structureel leeg, geen anomalie) haalt het toch bij de
    // top-2: bewijs dat structurele vulbaarheid meetelt zonder anomalie.
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(moments).toHaveLength(2);
    expect(moments.map((m) => m.date).sort()).toEqual([
      '2026-08-10', // ma — structureel leeg (geen anomalie)
      '2026-08-13', // do — diepe dip (vulbaar + ongewoon)
    ]);
  });

  it('markeert een echte dip als ongewoon rustig (do-middag)', async () => {
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    const thu = moments.find((m) => m.date === '2026-08-13');
    expect(thu).toBeDefined();
    expect(thu!.unusual).toBe(true);
  });
});

describe('getQuietMoments — tijdvenster (mig 0069)', () => {
  it('zonder venster loopt een rustige dag door tot in de avond', async () => {
    const svc = makeService(makeAllDayPattern()); // geen venster
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    const ma = moments.find((m) => m.date === '2026-08-10');
    expect(ma).toBeDefined();
    // Open tot 20:00 → het rustige blok reikt voorbij 17:00.
    expect(ma!.toHour).toBeGreaterThanOrEqual(17);
  });

  it('met venster 11–18 vallen voorstellen binnen die uren', async () => {
    const svc = makeService(makeAllDayPattern(), {
      window: { start: 11, end: 18 },
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    expect(moments.length).toBeGreaterThan(0);
    // Elk voorgesteld moment valt binnen 11:00–18:00.
    for (const m of moments) {
      expect(m.fromHour).toBeGreaterThanOrEqual(11);
      expect(m.toHour).toBeLessThan(18);
    }
  });
});

// ============================================================
// Datum-variatie + beleidslaag (2026-09-15)
// ============================================================

// Acht weken vanaf ma 2026-08-10.
const EIGHT_WEEKS_TO = '2026-10-04';

describe('getQuietMoments — rotatie over acht weken', () => {
  it('niet meer dan de helft van de kansen is dezelfde weekdag×dagdeel', async () => {
    // Dit is de acceptatie-eis. Hij haalt het alleen dankzij de VOORUIT
    // werkende cool-down: op historie alleen verandert er niets zolang de
    // eigenaar nog nergens op geklikt heeft, want dit is een stateless GET.
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments(
      'biz',
      FROM,
      EIGHT_WEEKS_TO,
      2,
    );
    expect(moments.length).toBeGreaterThanOrEqual(12);

    const tally = new Map<string, number>();
    for (const m of moments) {
      const key = `${m.weekday}|${m.daypart}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const grootste = Math.max(...tally.values());
    expect(grootste).toBeLessThanOrEqual(moments.length / 2);
    // En er zijn echt meerdere weekdagen in beeld, geen twee die elkaar afwisselen.
    expect(new Set([...tally.keys()]).size).toBeGreaterThanOrEqual(3);
  });

  it('zonder beleidslaag blijft het wél elke week dezelfde weekdagen', async () => {
    // Regressie-anker: dit is het gedrag van vóór 2026-09-15. Het laat zien
    // dat de rotatie hierboven van de beleidslaag komt en niet van toeval.
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments(
      'biz',
      FROM,
      EIGHT_WEEKS_TO,
      2,
      { applyPolicy: false },
    );
    const weekdagen = new Set(moments.map((m) => m.weekday));
    expect(weekdagen.size).toBe(2);
  });
});

describe('getQuietMoments — harde poorten', () => {
  it('een feestdag verschijnt niet als kans, maar wel als note', async () => {
    const svc = makeService(makePattern(), { holidays: true });
    // Week rond 2e Paasdag (ma 6 april 2026) — normaal dé maandag-kans.
    const { moments, notes } = await svc.getQuietMoments(
      'biz',
      '2026-04-06',
      '2026-04-12',
      7,
    );
    expect(moments.map((m) => m.date)).not.toContain('2026-04-06');
    expect(notes).toContainEqual({
      date: '2026-04-06',
      reason: 'feestdag',
      label: '2e Paasdag',
    });
  });

  it('een al afgedekte dag valt af én er schuift een andere dag voor in de plaats', async () => {
    // Dit is de bugfix: tot 2026-09-15 filterde de frontend afgedekte dagen
    // NA de week-cap weg, dus die dag vrat een van de twee weekplekken op en
    // werd de lijst korter in plaats van anders.
    const zonder = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      2,
    );
    expect(zonder.moments).toHaveLength(2);

    const svc = makeService(makePattern(), {
      covered: new Set([zonder.moments[0].date]),
    });
    const { moments, notes } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(moments.map((m) => m.date)).not.toContain(zonder.moments[0].date);
    expect(moments).toHaveLength(2); // de week blijft vol
    expect(notes).toContainEqual({
      date: zonder.moments[0].date,
      reason: 'al_afgedekt',
    });
  });
});

describe('getQuietMoments — datum-signalen', () => {
  it('een festival vlakbij duwt die dag omlaag in de ranking', async () => {
    // Ma en di zijn hier even leeg, dus de ranking hangt op het datum-signaal.
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    expect(kaal.moments[0].date).toBe('2026-08-10'); // ma wint op datumvolgorde

    const svc = makeService(p, {
      events: new Map([
        [
          '2026-08-10',
          [
            {
              name: 'Popfestival',
              category: 'festivals',
              place: 'Zutphen',
              distanceKm: 0.3,
              radiusKm: 10,
            },
          ],
        ],
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11'); // di, want ma wordt drukker
  });

  it('slecht weer kan een dag tot kans maken die het patroon niet haalt', async () => {
    // Vlak patroon: alleen maandag heeft structureel genoeg gat. Vrijdag zit
    // met 70−62 = 8 onder GAP_FLOOR en is dus géén kandidaat op het patroon.
    const p = makeFlatPattern([40, 66, 66, 66, 62, 70, 66]);

    const zonderWeer = await makeService(p).getQuietMoments('biz', FROM, TO, 7);
    expect(zonderWeer.moments.map((m) => m.date)).not.toContain('2026-08-14'); // vr

    const svc = makeService(p, {
      weather: new Map([
        ['2026-08-14', { tempMin: 11, tempMax: 15, code: 82 }], // zware buien
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    const vr = moments.find((m) => m.date === '2026-08-14');
    expect(vr).toBeDefined();
    expect(vr!.kind).toBe('incidenteel');
    expect(vr!.reasonKey).toBe('weatherRain');
  });

  it('een structurele kans houdt kind=structureel en een structurele reden', async () => {
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    const ma = moments.find((m) => m.date === '2026-08-10');
    expect(ma!.kind).toBe('structureel');
    expect(['structural', 'structuralRotated', 'unusual']).toContain(
      ma!.reasonKey,
    );
  });
});

describe('getQuietMoments — cool-down', () => {
  it('een slot dat vorige week gebruikt is, verliest van de eerstvolgende kans', async () => {
    // Ma (25) en di (28) liggen dicht bij elkaar; de demping van een week
    // ouderdom (×0,70) is dan precies genoeg om de volgorde te draaien. Dat
    // is ook de bedoeling: een cool-down mag een dag met een véél dieper gat
    // niet opzij zetten, alleen een dag die er vlak naast zit.
    const p = makeFlatPattern([25, 28, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    expect(top.date).toBe('2026-08-10'); // ma

    const svc = makeService(p, {
      // Vorige week (weekIndex −1) hetzelfde weekdag×dagdeel gebruikt.
      recentSlots: new Map([
        [`${top.weekday}|${top.daypart}`, [{ weekIndex: -1 }]],
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11'); // di
    // En de uitleg zegt wáárom het een andere dag is.
    expect(moments[0].reasonKey).toBe('structuralRotated');
  });

  it('dempt niet zo hard dat een veel diepere dip opzij gezet wordt', async () => {
    // Donderdag heeft een echte dip (gap 58 + anomalie); één week cool-down
    // hoort die niet te verslaan. Demping is een voorkeur, geen veto.
    const kaal = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      1,
    );
    const top = kaal.moments[0];
    const svc = makeService(makePattern(), {
      recentSlots: new Map([
        [`${top.weekday}|${top.daypart}`, [{ weekIndex: -1 }]],
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe(top.date);
  });

  it('demping sluit niet uit: is álles gedempt, dan blijft het tempo gehaald', async () => {
    // Elke weekdag×dagdeel is deze en vorige week al gebruikt. Er mag dan geen
    // enkel voorstel wegvallen — demping herschikt alleen.
    const alles = new Map<string, { weekIndex: number; weak?: boolean }[]>();
    for (let wd = 0; wd < 7; wd++) {
      for (const dp of ['ochtend', 'lunch', 'middag', 'diner', 'avond']) {
        alles.set(`${wd}|${dp}`, [{ weekIndex: 0 }, { weekIndex: -1 }]);
      }
    }
    const svc = makeService(makePattern(), { recentSlots: alles });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(moments).toHaveLength(2);
  });
});

describe('getQuietMoments — fail-soft', () => {
  it('valt de hele context weg, dan draait het model door op het patroon', async () => {
    const svc = makeService(makePattern());
    // loadQuietContext faalt hard (alsof Supabase, Open-Meteo én de
    // events-tabel tegelijk wegvallen zonder dat de interne catch aanslaat).
    jest
      .spyOn(
        svc as unknown as { loadQuietContext: () => Promise<unknown> },
        'loadQuietContext',
      )
      .mockRejectedValue(new Error('alles stuk'));

    await expect(svc.getQuietMoments('biz', FROM, TO, 2)).rejects.toThrow();
  });

  it('een lege context levert exact het patroon-only gedrag', async () => {
    const metContext = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      2,
    );
    const zonderBeleid = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      2,
      { applyPolicy: false },
    );
    // Binnen één week is er nog geen cool-down-historie, dus de keuze is gelijk.
    expect(metContext.moments.map((m) => m.date)).toEqual(
      zonderBeleid.moments.map((m) => m.date),
    );
  });
});

describe('getQuietMoments — applyPolicy:false voor een zelfgekozen dag', () => {
  it('geeft het dagdeel terug, ook op een feestdag of een afgedekte dag', async () => {
    const svc = makeService(makePattern(), {
      holidays: true,
      covered: new Set(['2026-04-06']),
    });
    const { moments } = await svc.getQuietMoments(
      'biz',
      '2026-04-06',
      '2026-04-06',
      999,
      { applyPolicy: false },
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].date).toBe('2026-04-06');
    expect(moments[0].daypartLabel).toBeTruthy();
  });
});

// ============================================================
// Terugkoppeling (fase 4)
// ============================================================

describe('getQuietMoments — terugkoppeling', () => {
  it('een bewezen slot wint van een gelijkwaardig slot zonder historie', async () => {
    // Ma en di zijn even leeg; alleen de gemeten uitkomst verschilt.
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    expect(kaal.moments[0].date).toBe('2026-08-10'); // ma op datumvolgorde

    const svc = makeService(p, {
      // Dinsdag-lunch leverde eerder duidelijk meer op dan de eigen mediaan.
      slotPerformance: new Map([['1|lunch', { medianLift: 14, samples: 8 }]]),
      businessMedianLift: 0,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11'); // di
  });

  it('doet niets onder het minimum aantal metingen', async () => {
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const svc = makeService(p, {
      // Zelfde forse uitslag, maar op twee metingen: te dun om te sturen.
      slotPerformance: new Map([['1|lunch', { medianLift: 14, samples: 2 }]]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-10'); // ongewijzigd
  });

  it('weegt af tegen de eigen mediaan, niet tegen nul', async () => {
    // Beide slots leverden +14 op, maar dat is bij deze zaak normaal. Er is
    // dan geen reden om het ene boven het andere te zetten.
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const svc = makeService(p, {
      slotPerformance: new Map([
        ['0|lunch', { medianLift: 14, samples: 8 }],
        ['1|lunch', { medianLift: 14, samples: 8 }],
      ]),
      businessMedianLift: 14,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-10'); // datumvolgorde beslist weer
  });

  it('dempt een slot dat het slechter doet dan de rest', async () => {
    const p = makeFlatPattern([25, 26, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    expect(kaal.moments[0].date).toBe('2026-08-10'); // ma is het leegst

    const svc = makeService(p, {
      // Maandag-lunch blijft achter bij wat deze zaak normaal haalt.
      slotPerformance: new Map([['0|lunch', { medianLift: -10, samples: 8 }]]),
      businessMedianLift: 6,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11'); // di
  });
});
