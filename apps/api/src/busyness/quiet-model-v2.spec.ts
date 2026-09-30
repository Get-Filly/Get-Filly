import { computeQuietV2 } from './quiet-model-v2';

// Café open 8 tot 20: ochtend druk, middag rustig, avond matig.
function makePattern(): number[][] {
  const prof = [45, 70, 80, 60, 75, 85, 60, 35, 30, 40, 55, 30]; // 8..19
  const scale = [0.7, 0.7, 0.75, 0.8, 0.9, 1, 0.9];
  return Array.from({ length: 7 }, (_, d) => {
    const row = new Array<number>(24).fill(0);
    prof.forEach((v, i) => (row[8 + i] = Math.round(v * scale[d])));
    return row;
  });
}
const FROM = '2026-10-05'; // maandag
const TO = '2026-10-11';

describe('computeQuietV2', () => {
  it('stelt niets voor in de marge na opening en voor sluiting', () => {
    const r = computeQuietV2(makePattern(), FROM, TO, 6);
    r.debug.usable.forEach((mask) => {
      expect(mask[8]).toBe(false); // eerste open uur
      expect(mask[18]).toBe(false); // laatste 2 uur voor sluiting
      expect(mask[19]).toBe(false);
      expect(mask[12]).toBe(true);
    });
    r.moments.forEach((m) => {
      expect(m.fromHour).toBeGreaterThanOrEqual(9);
      expect(m.toHour).toBeLessThanOrEqual(18);
    });
  });

  it('kiest het rustigste tijdvenster binnen het dagdeel', () => {
    const r = computeQuietV2(
      makePattern(),
      FROM,
      TO,
      6,
      {},
      { windowHours: 2 },
    );
    r.moments.forEach((m) => {
      expect(m.toHour - m.fromHour).toBe(2);
    });
    // en het venster valt binnen één dagdeel
    const def = {
      ochtend: [6, 11],
      lunch: [11, 14],
      middag: [14, 17],
      diner: [17, 21],
      avond: [21, 24],
    } as Record<string, number[]>;
    r.moments.forEach((m) => {
      expect(m.fromHour).toBeGreaterThanOrEqual(def[m.daypart][0]);
      expect(m.toHour).toBeLessThanOrEqual(def[m.daypart][1]);
    });
  });

  it('weegt een weekend zwaarder dan een doordeweekse dag (haalbaarheid)', () => {
    const flat = Array.from({ length: 7 }, () => {
      const row = new Array<number>(24).fill(0);
      for (let h = 9; h < 22; h++) row[h] = 40;
      row[19] = row[20] = row[21] = 90; // piek
      return row;
    });
    const r = computeQuietV2(flat, FROM, TO, 1);
    expect(r.moments).toHaveLength(1);
    expect([5, 6]).toContain(r.moments[0].weekday); // za of zo
  });

  it('telt ingeplande dagen mee voor het tempo', () => {
    const planned = new Set(['2026-10-05', '2026-10-06']);
    const r = computeQuietV2(makePattern(), FROM, TO, 2, { planned });
    expect(r.moments).toHaveLength(0);
    expect(r.weeks[0]).toMatchObject({ planned: 2, cap: 2, picked: 0 });
  });

  it('laat een evenement-kans boven het tempo uit als uitzondering', () => {
    const planned = new Set(['2026-10-05', '2026-10-06']);
    const events = new Map([
      [
        '2026-10-10',
        [
          {
            name: 'Festival',
            category: 'festivals',
            place: 'X',
            distanceKm: 0.5,
            radiusKm: 10,
          },
        ],
      ],
    ]);
    const r = computeQuietV2(makePattern(), FROM, TO, 2, { planned, events });
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0]).toMatchObject({ date: '2026-10-10', exception: true });
    expect(r.weeks[0].exception).toBe(true);
  });

  it('roteert: het moment van vorige week weegt minder (cool-down)', () => {
    const r = computeQuietV2(makePattern(), '2026-10-05', '2026-10-25', 1);
    const perWeek = r.weeks.map((w) =>
      r.moments.filter(
        (m) =>
          m.date >= w.week &&
          m.date <
            new Date(Date.parse(`${w.week}T12:00:00Z`) + 7 * 86400000)
              .toISOString()
              .slice(0, 10),
      ),
    );
    const keys = perWeek.map((ms) => `${ms[0].weekday}|${ms[0].daypart}`);
    // zonder cool-down zou elke week dezelfde combinatie winnen
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('doet nooit een voorstel voor een moment dat de eigenaar uit heeft gezet', () => {
    const free = computeQuietV2(makePattern(), FROM, TO, 6);
    const first = free.moments[0];
    const disabled = new Set([`${first.weekday}|${first.daypart}`]);
    const r = computeQuietV2(makePattern(), FROM, TO, 6, {
      disabledSlots: disabled,
    });
    r.moments.forEach((m) => {
      expect(`${m.weekday}|${m.daypart}`).not.toBe(
        `${first.weekday}|${first.daypart}`,
      );
    });
  });

  it('laat een feestdag helemaal af', () => {
    const r = computeQuietV2(makePattern(), FROM, TO, 6, {
      holidays: new Map([['2026-10-10', 'Testdag']]),
    });
    expect(r.moments.find((m) => m.date === '2026-10-10')).toBeUndefined();
  });
});
