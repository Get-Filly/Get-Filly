import { BusynessService } from './busyness.service';
import type { SlotPerformance, WeatherSignal } from './quiet-signals';

// ============================================================
// getQuietMoments — de service rond het model (quiet-model.ts)
// ============================================================
// De rekenregels van het model zelf staan in quiet-model.spec.ts en
// quiet-model.scenarios.spec.ts. Hier toetsen we wat de SERVICE erbij doet:
// de context ophalen (feestdagen, ingepland, weer, evenementen, cool-down),
// de eigenaar-instellingen lezen (tijdvenster, Mijn momenten) en de uitkomst
// vertalen naar QuietMoment.
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
  // Feestdagen waarop de eigenaar wil inspelen (datum -> naam).
  holidays?: Record<string, string>;
  covered?: Set<string>;
  weather?: Map<string, WeatherSignal>;
  events?: Map<string, unknown[]>;
  recentSlots?: Map<string, { weekIndex: number; weak?: boolean }[]>;
  hasTerrace?: boolean;
  // Fase 4: wat campagnes per slot eerder deden, plus het ijkpunt.
  slotPerformance?: Map<string, SlotPerformance>;
  businessMedianLift?: number;
  // Mijn momenten (mig 0080): door de eigenaar uitgezet, als "weekdag|dagdeel".
  disabled?: string[];
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

  jest
    .spyOn(
      svc as unknown as { getDisabledSlots: () => Promise<Set<string>> },
      'getDisabledSlots',
    )
    .mockResolvedValue(new Set(overrides.disabled ?? []));

  // De hele datum-/beleidscontext in één mock: dat is precies de naad waar in
  // productie de DB, Open-Meteo en de events-tabel achter zitten, en waar de
  // fail-soft-terugval op uitkomt.
  const holidayByDate = new Map<string, string>(
    Object.entries(overrides.holidays ?? {}),
  );
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
// Acht weken vanaf ma 2026-08-10.
const EIGHT_WEEKS_TO = '2026-10-04';

const dates = (ms: { date: string }[]) => ms.map((m) => m.date);

describe('getQuietMoments — basis', () => {
  it('surfacet de structureel-leegste dag (maandag) en laat de piekdag met rust', async () => {
    const svc = makeService(makePattern());
    const { hasSource, moments } = await svc.getQuietMoments(
      'biz',
      FROM,
      TO,
      7,
    );
    expect(hasSource).toBe(true);
    expect(dates(moments)).toContain('2026-08-10'); // ma: leegste dag
    expect(dates(moments)).not.toContain('2026-08-15'); // za: de piek, niets te vullen
  });

  it('zonder patroon is er geen bron', async () => {
    const svc = makeService(makePattern());
    jest.spyOn(svc, 'getLatest').mockResolvedValue({
      pattern: null,
      openingHours: null,
      livePct: null,
      liveHour: null,
      liveWeekday: null,
      capturedAt: null,
    });
    expect(await svc.getQuietMoments('biz', FROM, TO, 2)).toEqual({
      hasSource: false,
      moments: [],
      notes: [],
    });
  });

  it('levert de velden die de consumenten verwachten', async () => {
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    for (const m of moments) {
      expect(['ochtend', 'lunch', 'middag', 'diner']).toContain(m.daypart);
      expect(m.dayparts).toEqual([m.daypart]);
      expect(m.toHour).toBeGreaterThanOrEqual(m.fromHour); // laatste uur, inclusief
      expect(typeof m.reasonKey).toBe('string');
      expect(m.deviation).toEqual(expect.any(Number));
    }
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
  it('zonder venster mag een voorstel al in de lunch vallen', async () => {
    const svc = makeService(makeAllDayPattern());
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    // Bij een vlak patroon is elk dagdeel even leeg; het eerste (lunch) wint.
    expect(moments.some((m) => m.fromHour < 14)).toBe(true);
  });

  it('met venster 14–18 vallen alle voorstellen binnen die uren', async () => {
    const svc = makeService(makeAllDayPattern(), {
      window: { start: 14, end: 18 },
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    expect(moments.length).toBeGreaterThan(0);
    for (const m of moments) {
      expect(m.fromHour).toBeGreaterThanOrEqual(14);
      expect(m.toHour).toBeLessThan(18);
    }
  });
});

describe('getQuietMoments — rotatie over acht weken', () => {
  it('niet meer dan de helft van de kansen is dezelfde weekdag×dagdeel', async () => {
    // De acceptatie-eis. Haalt het alleen dankzij de VOORUIT werkende
    // cool-down: dit is een stateless GET, dus op historie alleen verandert
    // er niets zolang de eigenaar nog nergens op geklikt heeft.
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
    expect(Math.max(...tally.values())).toBeLessThanOrEqual(moments.length / 2);
    expect(tally.size).toBeGreaterThanOrEqual(3);
  });

  it('zonder beleidslaag blijft het wél elke week dezelfde weekdagen', async () => {
    // Regressie-anker: laat zien dat de rotatie van de beleidslaag komt.
    const svc = makeService(makePattern());
    const { moments } = await svc.getQuietMoments(
      'biz',
      FROM,
      EIGHT_WEEKS_TO,
      2,
      {
        applyPolicy: false,
      },
    );
    expect(new Set(moments.map((m) => m.weekday)).size).toBe(2);
  });
});

describe('getQuietMoments — harde poorten en tempo', () => {
  it('een gewone feestdag is een moment om op in te spelen (bonus, met reden)', async () => {
    // 2e Paasdag 2026 is ma 6 april. Zonder feestdag wint dinsdag op gelijke
    // stand; met feestdag wint maandag, met de feestdag als reden.
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const svc = makeService(p, {
      holidays: { '2026-04-07': 'Testfeest' },
    });
    const { moments, notes } = await svc.getQuietMoments(
      'biz',
      '2026-04-06',
      '2026-04-12',
      1,
    );
    expect(moments[0].date).toBe('2026-04-07');
    expect(moments[0].reasonKey).toBe('holiday');
    expect(moments[0].reasonParams).toEqual({ name: 'Testfeest' });
    expect(notes).toEqual([]);
  });

  it('een al ingeplande dag telt mee voor het tempo en valt zelf af', async () => {
    // Tempo 2 en één dag staat al klaar: Filly draagt nog één nieuwe aan
    // (2 min 1), niet twee. De ingeplande dag zelf komt er nooit meer bij.
    const zonder = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      2,
    );
    expect(zonder.moments).toHaveLength(2);

    const covered = zonder.moments[0].date;
    const svc = makeService(makePattern(), { covered: new Set([covered]) });
    const { moments, notes } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(dates(moments)).not.toContain(covered);
    expect(moments).toHaveLength(1);
    expect(notes).toContainEqual({ date: covered, reason: 'al_afgedekt' });
  });

  it('zijn er al genoeg ingepland, dan stelt Filly niets nieuws voor', async () => {
    const svc = makeService(makePattern(), {
      covered: new Set(['2026-08-10', '2026-08-11']),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(moments).toHaveLength(0);
  });
});

describe('getQuietMoments — Mijn momenten (mig 0080)', () => {
  it('doet nooit een voorstel voor een uitgezet moment', async () => {
    const vrij = await makeService(makePattern()).getQuietMoments(
      'biz',
      FROM,
      TO,
      7,
    );
    const eerste = vrij.moments[0];
    const svc = makeService(makePattern(), {
      disabled: [`${eerste.weekday}|${eerste.daypart}`],
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    expect(
      moments.some(
        (m) => m.weekday === eerste.weekday && m.daypart === eerste.daypart,
      ),
    ).toBe(false);
  });

  it('een zelfgekozen dag (applyPolicy:false) wordt niet weggefilterd', async () => {
    const svc = makeService(makePattern(), {
      disabled: ['0|lunch', '0|middag', '0|diner', '0|ochtend'],
    });
    const { moments } = await svc.getQuietMoments(
      'biz',
      '2026-08-10',
      '2026-08-10',
      999,
      {
        applyPolicy: false,
      },
    );
    expect(moments).toHaveLength(1);
  });
});

describe('getQuietMoments — datum-signalen', () => {
  it('een festival vlakbij maakt die dag juist tot voorkeurskans (bonus)', async () => {
    // Ma en di zijn hier even leeg; zonder signaal wint ma op datumvolgorde.
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    expect(kaal.moments[0].date).toBe('2026-08-10');

    const svc = makeService(p, {
      events: new Map([
        [
          '2026-08-11',
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
    expect(moments[0].date).toBe('2026-08-11'); // di: het festival geeft een bonus
    expect(moments[0].reasonKey).toBe('eventNearby');
  });

  it('slecht weer kan een dag tot kans maken die het patroon niet haalt', async () => {
    // Piek 70. Vrijdag 50: gat 20, onder de drempel (35% = 24,5). Met buien
    // (×0,85) wordt het 42,5: gat 27,5, dus wel een kans.
    const p = makeFlatPattern([40, 66, 66, 66, 50, 70, 66]);
    const zonderWeer = await makeService(p).getQuietMoments('biz', FROM, TO, 7);
    expect(dates(zonderWeer.moments)).not.toContain('2026-08-14');

    const svc = makeService(p, {
      weather: new Map([
        ['2026-08-14', { tempMin: 11, tempMax: 15, code: 82 }],
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
    const p = makeFlatPattern([25, 28, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    expect(top.date).toBe('2026-08-10'); // ma

    const svc = makeService(p, {
      recentSlots: new Map([
        [`${top.weekday}|${top.daypart}`, [{ weekIndex: -1 }]],
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11'); // di
    expect(moments[0].reasonKey).toBe('structuralRotated');
  });

  it('dempt niet zo hard dat een veel diepere dip opzij gezet wordt', async () => {
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
    const alles = new Map<string, { weekIndex: number; weak?: boolean }[]>();
    for (let wd = 0; wd < 7; wd++) {
      for (const dp of ['ochtend', 'lunch', 'middag', 'diner']) {
        alles.set(`${wd}|${dp}`, [{ weekIndex: 0 }, { weekIndex: -1 }]);
      }
    }
    const svc = makeService(makePattern(), { recentSlots: alles });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 2);
    expect(moments).toHaveLength(2);
  });
});

describe('getQuietMoments — fail-soft', () => {
  it('valt de hele context weg, dan gooit de service (de aanroeper vangt dat)', async () => {
    const svc = makeService(makePattern());
    jest
      .spyOn(
        svc as unknown as { loadQuietContext: () => Promise<unknown> },
        'loadQuietContext',
      )
      .mockRejectedValue(new Error('alles stuk'));
    await expect(svc.getQuietMoments('biz', FROM, TO, 2)).rejects.toThrow();
  });

  it('een lege context levert binnen één week hetzelfde als applyPolicy:false', async () => {
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
      {
        applyPolicy: false,
      },
    );
    expect(dates(metContext.moments)).toEqual(dates(zonderBeleid.moments));
  });
});

describe('getQuietMoments — applyPolicy:false voor een zelfgekozen dag', () => {
  it('geeft het dagdeel terug, ook op een feestdag of een afgedekte dag', async () => {
    const svc = makeService(makePattern(), {
      holidays: { '2026-04-06': 'Stille dag' },
      covered: new Set(['2026-04-06']),
    });
    const { moments } = await svc.getQuietMoments(
      'biz',
      '2026-04-06',
      '2026-04-06',
      999,
      {
        applyPolicy: false,
      },
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].date).toBe('2026-04-06');
    expect(moments[0].daypartLabel).toBeTruthy();
  });
});

describe('getQuietMoments — terugkoppeling', () => {
  it('een bewezen slot wint van een gelijkwaardig slot zonder historie', async () => {
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    expect(top.date).toBe('2026-08-10');

    const svc = makeService(p, {
      // Dinsdag, zelfde dagdeel, leverde eerder duidelijk meer op dan de eigen mediaan.
      slotPerformance: new Map([
        [`1|${top.daypart}`, { medianLift: 14, samples: 8 }],
      ]),
      businessMedianLift: 0,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11');
  });

  it('doet niets onder het minimum aantal metingen', async () => {
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    const svc = makeService(p, {
      slotPerformance: new Map([
        [`1|${top.daypart}`, { medianLift: 14, samples: 2 }],
      ]),
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-10');
  });

  it('weegt af tegen de eigen mediaan, niet tegen nul', async () => {
    const p = makeFlatPattern([25, 25, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    const svc = makeService(p, {
      slotPerformance: new Map([
        [`0|${top.daypart}`, { medianLift: 14, samples: 8 }],
        [`1|${top.daypart}`, { medianLift: 14, samples: 8 }],
      ]),
      businessMedianLift: 14,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-10');
  });

  it('dempt een slot dat het slechter doet dan de rest', async () => {
    const p = makeFlatPattern([25, 26, 55, 60, 65, 70, 60]);
    const kaal = await makeService(p).getQuietMoments('biz', FROM, TO, 1);
    const top = kaal.moments[0];
    expect(top.date).toBe('2026-08-10');
    const svc = makeService(p, {
      slotPerformance: new Map([
        [`0|${top.daypart}`, { medianLift: -10, samples: 8 }],
      ]),
      businessMedianLift: 6,
    });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 1);
    expect(moments[0].date).toBe('2026-08-11');
  });
});
