import {
  aggregateDaypartActuals,
  comparableDays,
} from './quiet-feedback.service';

// ============================================================
// De rekenkern van de terugkoppeling (fase 4)
// ============================================================
// Puur, dus zonder Supabase. Wat hier geborgd wordt is de meetdefinitie
// zelf: eerst per uur de mediaan, dan het gemiddelde over het dagdeel, en
// een baseline die alleen op écht vergelijkbare dagen rust.

// Hulpje: een live-meting op een Amsterdamse datum + uur. In september is
// Amsterdam UTC+2, dus uur 12 lokaal = 10:00 UTC.
function meting(date: string, hour: number, pct: number) {
  return {
    captured_at: `${date}T${String(hour - 2).padStart(2, '0')}:15:00Z`,
    live_pct: pct,
    live_hour: hour,
  };
}

describe('aggregateDaypartActuals', () => {
  it('neemt per uur de mediaan en middelt daarna over het dagdeel', () => {
    const rows = [
      // Lunch = 11, 12, 13.
      meting('2026-09-01', 11, 40),
      meting('2026-09-01', 11, 60), // mediaan van dit uur = 50
      meting('2026-09-01', 12, 30),
      meting('2026-09-01', 13, 10),
    ];
    const out = aggregateDaypartActuals(rows);
    const lunch = out.get('2026-09-01|lunch');
    expect(lunch).toBeDefined();
    // (50 + 30 + 10) / 3 = 30
    expect(lunch!.avg).toBeCloseTo(30);
    expect(lunch!.hours).toBe(3);
  });

  it('laat één uitschieter-uur het dagdeel niet meetrekken', () => {
    // Google's live-waarde springt (0↔100); de mediaan per uur vangt dat.
    const rows = [
      meting('2026-09-01', 11, 30),
      meting('2026-09-01', 11, 30),
      meting('2026-09-01', 11, 100), // uitschieter binnen hetzelfde uur
      meting('2026-09-01', 12, 30),
    ];
    const lunch = aggregateDaypartActuals(rows).get('2026-09-01|lunch');
    expect(lunch!.avg).toBeCloseTo(30); // niet 47,5
  });

  it('telt alleen de uren die echt gemeten zijn', () => {
    const lunch = aggregateDaypartActuals([meting('2026-09-01', 12, 44)]).get(
      '2026-09-01|lunch',
    );
    expect(lunch!.hours).toBe(1);
    expect(lunch!.avg).toBeCloseTo(44);
  });

  it('splitst metingen over de juiste dagdelen', () => {
    const out = aggregateDaypartActuals([
      meting('2026-09-01', 12, 40), // lunch
      meting('2026-09-01', 15, 20), // middag
      meting('2026-09-01', 19, 80), // diner
    ]);
    expect(out.get('2026-09-01|lunch')!.avg).toBeCloseTo(40);
    expect(out.get('2026-09-01|middag')!.avg).toBeCloseTo(20);
    expect(out.get('2026-09-01|diner')!.avg).toBeCloseTo(80);
    expect(out.get('2026-09-01|ochtend')).toBeUndefined();
  });

  it('valt terug op het uur uit captured_at als live_hour ontbreekt', () => {
    const out = aggregateDaypartActuals([
      { captured_at: '2026-09-01T10:15:00Z', live_pct: 55, live_hour: null },
    ]);
    // 10:15 UTC = 12:15 in Amsterdam (zomertijd) → lunch.
    expect(out.get('2026-09-01|lunch')?.avg).toBeCloseTo(55);
  });
});

describe('comparableDays', () => {
  // 2026-09-01 is een dinsdag; 08, 15 en 22 september ook.
  const actuals = aggregateDaypartActuals([
    meting('2026-09-01', 12, 50), // di — doeldatum
    meting('2026-09-08', 12, 30), // di
    meting('2026-09-15', 12, 40), // di
    meting('2026-09-22', 12, 20), // di
    meting('2026-09-02', 12, 90), // wo — andere weekdag
    meting('2026-09-09', 19, 70), // di maar ander dagdeel
  ]);

  it('pakt alleen dezelfde weekdag en hetzelfde dagdeel', () => {
    const out = comparableDays(actuals, '2026-09-01', 'lunch', new Set());
    expect(out.sort((a, b) => a - b)).toEqual([20, 30, 40]);
  });

  it('laat de doeldatum zelf buiten de baseline', () => {
    const out = comparableDays(actuals, '2026-09-01', 'lunch', new Set());
    expect(out).not.toContain(50);
  });

  it('sluit andere campagnedagen uit', () => {
    // Een dag waar óók een campagne op stond is geen neutrale vergelijking.
    const out = comparableDays(
      actuals,
      '2026-09-01',
      'lunch',
      new Set(['2026-09-15']),
    );
    expect(out.sort((a, b) => a - b)).toEqual([20, 30]);
  });

  it('geeft een lege lijst als er niets vergelijkbaars is', () => {
    expect(comparableDays(actuals, '2026-09-01', 'avond', new Set())).toEqual(
      [],
    );
  });
});
