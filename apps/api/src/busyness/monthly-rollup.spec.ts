import { aggregateMonthly, type LiveRow } from './busyness.service';

// ============================================================
// Maandoverzicht — de rekenkern (mig 0075)
// ============================================================
// Dit overzicht is het enige dat de prune van busyness_snapshots overleeft.
// Wat hier misgaat, is over een jaar niet meer te herstellen: de bron is dan
// weg. Vandaar dat de meetdefinitie hier expliciet vastligt.

function meting(date: string, hour: number, pct: number): LiveRow {
  // September = UTC+2 in Amsterdam.
  return {
    captured_at: `${date}T${String(hour - 2).padStart(2, '0')}:10:00Z`,
    live_pct: pct,
    live_hour: hour,
  };
}

function patroon(open: Record<number, number>): number[][] {
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (let d = 0; d < 7; d++) {
    for (const [h, v] of Object.entries(open)) p[d][Number(h)] = v;
  }
  return p;
}

// Dinsdagen in september 2026: 1, 8, 15, 22, 29.
const DI_SEP = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];

describe('aggregateMonthly', () => {
  it('groepeert per maand, weekdag en uur', () => {
    const cells = aggregateMonthly(
      DI_SEP.map((d) => meting(d, 12, 40)),
      null,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      month: '2026-09-01',
      weekday: 1,
      hour: 12,
      days: 4,
    });
  });

  it('zet de maand altijd op de eerste van de maand', () => {
    const cells = aggregateMonthly([meting('2026-09-22', 12, 40)], null);
    expect(cells[0].month).toBe('2026-09-01');
  });

  it('scheidt maanden, ook binnen dezelfde weekdag', () => {
    const cells = aggregateMonthly(
      [
        ...DI_SEP.map((d) => meting(d, 12, 40)),
        meting('2026-10-06', 12, 80),
        meting('2026-10-13', 12, 80),
      ],
      null,
    );
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({
      month: '2026-09-01',
      actualPct: 40,
      days: 4,
    });
    expect(cells[1]).toMatchObject({
      month: '2026-10-01',
      actualPct: 80,
      days: 2,
    });
  });

  it('neemt per uur de mediaan en dan de mediaan over de dagen', () => {
    const cells = aggregateMonthly(
      DI_SEP.map((d, i) => meting(d, 12, [40, 50, 60, 70][i])),
      null,
    );
    expect(cells[0].actualPct).toBe(55); // mediaan van 40/50/60/70
  });

  it('laat een uitschieter binnen één uur de maand niet meetrekken', () => {
    const cells = aggregateMonthly(
      [
        ...DI_SEP.map((d) => meting(d, 12, 30)),
        meting('2026-09-01', 12, 100), // tweede meting in hetzelfde uur
      ],
      null,
    );
    expect(cells[0].actualPct).toBe(30);
    expect(cells[0].days).toBe(4); // de extra meting is geen extra dag
  });

  it('bewaart de verwachting van dat moment mee', () => {
    // Zonder de verwachting van tóén valt een vergelijking met vorig jaar
    // niet uit te leggen: het Google-patroon verschuift.
    const cells = aggregateMonthly(
      DI_SEP.map((d) => meting(d, 12, 40)),
      patroon({ 12: 65 }),
    );
    expect(cells[0].expectedPct).toBe(65);
  });

  it('laat de verwachting leeg waar Google zegt dat de zaak dicht is', () => {
    const cells = aggregateMonthly(
      DI_SEP.map((d) => meting(d, 12, 40)),
      patroon({ 12: 0 }),
    );
    expect(cells[0].expectedPct).toBeNull();
  });

  it('laat de verwachting leeg zonder patroon', () => {
    const cells = aggregateMonthly([meting('2026-09-01', 12, 40)], null);
    expect(cells[0].expectedPct).toBeNull();
  });

  it('levert een stabiele volgorde op maand, weekdag, uur', () => {
    const cells = aggregateMonthly(
      [
        meting('2026-09-02', 19, 50), // wo, avond
        meting('2026-09-01', 12, 40), // di, lunch
        meting('2026-09-01', 19, 60), // di, avond
      ],
      null,
    );
    expect(cells.map((c) => `${c.weekday}|${c.hour}`)).toEqual([
      '1|12',
      '1|19',
      '2|19',
    ]);
  });

  it('geeft niets terug zonder metingen', () => {
    expect(aggregateMonthly([], patroon({ 12: 50 }))).toEqual([]);
  });
});
