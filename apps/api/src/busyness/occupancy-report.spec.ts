import { aggregateOccupancyReport, type LiveRow } from './busyness.service';

// ============================================================
// Bezettingsrapportage — de rekenkern
// ============================================================
// Puur, dus zonder Supabase. Twee dingen zijn hier makkelijk mis te doen en
// daarom expliciet geborgd:
//   1. eerst per uur de mediaan, dán over de dagen — andersom trekt één
//      uitschieter-meting de hele cel mee;
//   2. de verwachting wordt gerekend over PRECIES de uren die ook gemeten
//      zijn. Anders vergelijk je twee gemeten uren met een verwachting over
//      vier uur, en is het "verschil" een rekenfout.

// Een meting op een Amsterdamse datum + uur. September = UTC+2.
function meting(date: string, hour: number, pct: number): LiveRow {
  return {
    captured_at: `${date}T${String(hour - 2).padStart(2, '0')}:10:00Z`,
    live_pct: pct,
    live_hour: hour,
  };
}

// 7×24-patroon; alleen de opgegeven uren staan open, met de gegeven waarde.
function patroon(open: Record<number, number>): number[][] {
  const p = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (let d = 0; d < 7; d++) {
    for (const [h, v] of Object.entries(open)) p[d][Number(h)] = v;
  }
  return p;
}

// Vier dinsdagen in september 2026: 1, 8, 15, 22.
const DINSDAGEN = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];

describe('aggregateOccupancyReport — uur-cellen', () => {
  it('neemt per uur de mediaan en dan de mediaan over de dagen', () => {
    const rows = DINSDAGEN.flatMap((d, i) => [
      meting(d, 12, [40, 50, 60, 70][i]),
    ]);
    const { hourly } = aggregateOccupancyReport(rows, null, 3);
    const cel = hourly.find((h) => h.weekday === 1 && h.hour === 12);
    expect(cel).toBeDefined();
    expect(cel!.days).toBe(4);
    expect(cel!.actual).toBe(55); // mediaan van 40/50/60/70
  });

  it('laat een uitschieter binnen één uur de cel niet meetrekken', () => {
    const rows = [
      ...DINSDAGEN.flatMap((d) => [meting(d, 12, 30)]),
      // Eén extra meting van 100 binnen hetzelfde uur op dezelfde dag.
      meting('2026-09-01', 12, 100),
    ];
    const cel = aggregateOccupancyReport(rows, null, 3).hourly.find(
      (h) => h.weekday === 1 && h.hour === 12,
    );
    expect(cel!.actual).toBe(30);
  });

  it('geeft geen waarde bij te weinig gemeten dagen, maar meldt de cel wel', () => {
    const rows = [meting('2026-09-01', 12, 44), meting('2026-09-08', 12, 46)];
    const cel = aggregateOccupancyReport(rows, null, 3).hourly.find(
      (h) => h.weekday === 1 && h.hour === 12,
    );
    expect(cel).toBeDefined();
    expect(cel!.days).toBe(2);
    expect(cel!.actual).toBeNull(); // liever leeg dan een getal op 2 dagen
  });

  it('laat ongemeten uren helemaal weg', () => {
    const rows = DINSDAGEN.map((d) => meting(d, 12, 40));
    const { hourly } = aggregateOccupancyReport(rows, null, 3);
    expect(hourly).toHaveLength(1);
    expect(hourly[0].hour).toBe(12);
  });
});

describe('aggregateOccupancyReport — verwacht naast werkelijk', () => {
  it('rekent de verwachting over precies de gemeten uren', () => {
    // Lunch = 11, 12, 13. Google verwacht 30 om 11u en 60 om 12 en 13u.
    // Wij meten alleen 12 en 13 (om 11u is er niets binnengekomen).
    // Verwachting moet dan 60 zijn, niet (30+60+60)/3 = 50.
    const p = patroon({ 11: 30, 12: 60, 13: 60 });
    const rows = DINSDAGEN.flatMap((d) => [
      meting(d, 12, 40),
      meting(d, 13, 40),
    ]);
    const dp = aggregateOccupancyReport(rows, p, 3).dayparts.find(
      (x) => x.weekday === 1 && x.daypart === 'lunch',
    );
    expect(dp).toBeDefined();
    expect(dp!.expected).toBe(60);
    expect(dp!.actual).toBe(40);
    expect(dp!.diff).toBe(-20);
    expect(dp!.hours).toBe(2);
  });

  it('slaat uren over waar Google zegt dat de zaak dicht is', () => {
    // Om 11u staat het patroon op 0 (dicht), maar er is wel een meting.
    // Die mag de vergelijking niet vervuilen.
    const p = patroon({ 11: 0, 12: 50, 13: 50 });
    const rows = DINSDAGEN.flatMap((d) => [
      meting(d, 11, 90),
      meting(d, 12, 40),
      meting(d, 13, 40),
    ]);
    const dp = aggregateOccupancyReport(rows, p, 3).dayparts.find(
      (x) => x.weekday === 1 && x.daypart === 'lunch',
    );
    expect(dp!.hours).toBe(2); // niet 3
    expect(dp!.actual).toBe(40); // de 90 telt niet mee
  });

  it('meldt een dagdeel niet bij te weinig gemeten uren', () => {
    const p = patroon({ 11: 50, 12: 50, 13: 50 });
    const rows = DINSDAGEN.map((d) => meting(d, 12, 40)); // één uur
    const dp = aggregateOccupancyReport(rows, p, 3).dayparts.find(
      (x) => x.weekday === 1 && x.daypart === 'lunch',
    );
    expect(dp).toBeUndefined();
  });

  it('herkent ook voorlopen op de verwachting', () => {
    const p = patroon({ 12: 40, 13: 40 });
    const rows = DINSDAGEN.flatMap((d) => [
      meting(d, 12, 55),
      meting(d, 13, 55),
    ]);
    const dp = aggregateOccupancyReport(rows, p, 3).dayparts.find(
      (x) => x.weekday === 1 && x.daypart === 'lunch',
    );
    expect(dp!.diff).toBe(15);
  });

  it('geeft geen dagdelen zonder patroon', () => {
    const rows = DINSDAGEN.flatMap((d) => [
      meting(d, 12, 40),
      meting(d, 13, 40),
    ]);
    expect(aggregateOccupancyReport(rows, null, 3).dayparts).toEqual([]);
  });
});
