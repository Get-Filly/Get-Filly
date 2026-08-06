import { BusynessService } from './busyness.service';

// ============================================================
// getQuietMoments — vulbaarheid-first model (2026-08-06)
// ============================================================
// Borgt de ontwerp-omslag van "alleen ongewoon rustig" (anomalie-poort)
// naar "best vulbare rustige momenten". Kern-assertie: een STRUCTUREEL-lege
// dag (maandag) komt nu als kans naar boven — onder het oude anomalie-model
// werd die juist weggefilterd ("normaal rustig, dus geen afwijking").

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

function makeService(
  pattern: number[][],
  window: { start: number; end: number } | null = null,
): BusynessService {
  const svc = new BusynessService({} as never, {} as never);
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
    .spyOn(svc as unknown as { getQuietWindow: () => Promise<unknown> }, 'getQuietWindow')
    .mockResolvedValue(window);
  return svc;
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
    const svc = makeService(makeAllDayPattern(), { start: 11, end: 18 });
    const { moments } = await svc.getQuietMoments('biz', FROM, TO, 7);
    expect(moments.length).toBeGreaterThan(0);
    // Elk voorgesteld moment valt binnen 11:00–18:00.
    for (const m of moments) {
      expect(m.fromHour).toBeGreaterThanOrEqual(11);
      expect(m.toHour).toBeLessThan(18);
    }
  });
});
