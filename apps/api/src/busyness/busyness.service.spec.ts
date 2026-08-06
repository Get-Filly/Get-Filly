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

function makeService(pattern: number[][]): BusynessService {
  const svc = new BusynessService({} as never, {} as never);
  jest.spyOn(svc, 'getLatest').mockResolvedValue({
    pattern,
    openingHours: null,
    livePct: null,
    liveHour: null,
    liveWeekday: null,
    capturedAt: null,
  });
  return svc;
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
