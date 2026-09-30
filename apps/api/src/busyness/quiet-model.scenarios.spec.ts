import { computeQuiet, DAGDEEL_DEFS } from './quiet-model';
import { QUIET_PARAMS } from './quiet-params';
import type { EventSignal, WeatherSignal } from './quiet-signals';

// 300 gegenereerde zaken (vaste seed, dus reproduceerbaar). Elke zaak krijgt
// een ander weekpatroon, weer, evenementen en ingeplande dagen. We toetsen de
// regels die ALTIJD moeten gelden, wat het patroon ook is.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ARCH: { s: number; p: number[] }[] = [
  { s: 11, p: [55, 75, 65, 40, 25, 30, 55, 85, 95, 90, 65, 40] }, // bistro
  { s: 8, p: [45, 70, 80, 60, 75, 85, 60, 35, 30, 40, 55, 30] }, // café
  { s: 17, p: [30, 60, 85, 90, 70, 45, 25] }, // alleen diner
  { s: 8, p: [40, 65, 85, 95, 80, 60, 40, 25, 15] }, // lunchroom
  { s: 11, p: [40, 60, 55, 35, 30, 35, 60, 85, 90, 85, 70, 50, 30] }, // brasserie
  { s: 15, p: [10, 15, 25, 40, 60, 80, 95, 90, 60] }, // bar
];
const FROM = '2026-10-05';
const TO = '2026-10-25';
const DATES = Array.from({ length: 21 }, (_, k) =>
  new Date(Date.UTC(2026, 9, 5 + k)).toISOString().slice(0, 10),
);

function scenario(R: () => number) {
  const pick = <T>(a: T[]) => a[Math.floor(R() * a.length)];
  const rnd = (a: number, b: number) => a + (b - a) * R();
  const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
  const a = pick(ARCH);
  const wk = rnd(0.6, 1.35);
  const scale = [
    rnd(0.5, 0.8),
    rnd(0.5, 0.85),
    rnd(0.6, 0.9),
    rnd(0.65, 0.95),
    rnd(0.85, 1),
    Math.min(1.2, wk),
    Math.min(1.2, wk * rnd(0.8, 1)),
  ];
  const start = a.s + ri(-1, 1);
  const prof = R() < 0.3 ? a.p.slice(0, a.p.length - ri(1, 2)) : a.p;
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let max = 0;
  for (let d = 0; d < 7; d++)
    for (let k = 0; k < prof.length; k++) {
      const h = start + k;
      if (h < 0 || h > 23) continue;
      const v = Math.max(1, prof[k] * scale[d] * (1 + rnd(-0.08, 0.08)));
      p[d][h] = v;
      max = Math.max(max, v);
    }
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++)
      p[d][h] = p[d][h] ? Math.max(1, Math.round((p[d][h] / max) * 100)) : 0;
  const events = new Map<string, EventSignal[]>();
  const weather = new Map<string, WeatherSignal>();
  const planned = new Set<string>();
  for (let e = ri(0, 2); e > 0; e--)
    events.set(pick(DATES), [
      {
        name: 'E',
        category: pick(['festivals', 'concerten_theater', 'events', 'kermis']),
        place: 'x',
        distanceKm: rnd(0.2, 4),
        radiusKm: 5,
      },
    ]);
  for (let w = ri(0, 4); w > 0; w--)
    weather.set(pick(DATES.slice(0, 7)), {
      tempMin: 6,
      tempMax: pick([5, 12, 25, 33]),
      code: pick([0, 3, 63, 95]),
    });
  for (let q = ri(0, 3); q > 0; q--) planned.add(pick(DATES));
  return {
    p,
    signals: { events, weather, planned, hasTerrace: R() < 0.5 },
    perWeek: pick([1, 2, 2, 3]),
  };
}

describe('computeQuiet, 300 gegenereerde zaken', () => {
  const R = rng(20260930);
  const scenarios = Array.from({ length: 300 }, () => scenario(R));

  it.each(scenarios.map((s, i) => [i, s] as const))(
    'zaak %i houdt zich aan alle regels',
    (_i, s) => {
      const r = computeQuiet(s.p, FROM, TO, s.perWeek, s.signals);
      const perWeek = new Map<string, number>();
      for (const m of r.moments) {
        // 1. nooit in de marge na opening of voor sluiting
        for (let h = m.fromHour; h < m.toHour; h++)
          expect(r.debug.usable[m.weekday][h]).toBe(true);
        // 2. venster valt binnen één dagdeel en heeft de gevraagde lengte
        const def = DAGDEEL_DEFS.find((d) => d.key === m.daypart)!;
        expect(m.fromHour).toBeGreaterThanOrEqual(def.from);
        expect(m.toHour).toBeLessThanOrEqual(def.to);
        expect(m.toHour - m.fromHour).toBe(QUIET_PARAMS.windowHours);
        // 3. nooit op een dag waar al iets voor staat
        expect(s.signals.planned.has(m.date)).toBe(false);
        // 4. een uitzondering heeft altijd een evenement
        if (m.exception) expect(m.eventBoost).toBeGreaterThan(0);
        // 5. maximaal één moment per dag
        expect(r.moments.filter((x) => x.date === m.date)).toHaveLength(1);
        const d = new Date(`${m.date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const wk = d.toISOString().slice(0, 10);
        perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
      }
      // 6. tempo minus ingepland, plus hooguit één "kans van de week"
      for (const w of r.weeks) {
        const slots = Math.max(0, w.cap - w.planned);
        expect(w.picked).toBeLessThanOrEqual(slots + 1);
        expect(w.picked - (w.exception ? 1 : 0)).toBeLessThanOrEqual(slots);
      }
    },
  );
});
