import { aggregateDaily, buildDayContext } from './daily-rollup';

// 5 oktober 2026 is een maandag. Zomertijd: UTC+2.
describe('aggregateDaily', () => {
  const pattern = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0),
  );
  pattern[0][12] = 60;

  it('neemt per datum en uur de mediaan en telt de metingen', () => {
    const rows = [
      { captured_at: '2026-10-05T10:05:00Z', live_pct: 40, live_hour: 12 },
      { captured_at: '2026-10-05T10:35:00Z', live_pct: 50, live_hour: 12 },
      { captured_at: '2026-10-05T10:50:00Z', live_pct: 90, live_hour: 12 },
    ];
    const cells = aggregateDaily(rows, pattern);
    expect(cells).toEqual([
      {
        day: '2026-10-05',
        weekday: 0,
        hour: 12,
        actualPct: 50,
        expectedPct: 60,
        measurements: 3,
      },
    ]);
  });

  it('houdt datums gescheiden en zet de verwachting op null zonder patroon', () => {
    const rows = [
      { captured_at: '2026-10-05T10:00:00Z', live_pct: 30, live_hour: 12 },
      { captured_at: '2026-10-06T10:00:00Z', live_pct: 70, live_hour: 12 },
    ];
    const cells = aggregateDaily(rows, null);
    expect(cells.map((c) => [c.day, c.actualPct, c.expectedPct])).toEqual([
      ['2026-10-05', 30, null],
      ['2026-10-06', 70, null],
    ]);
  });

  it('valt terug op het Amsterdamse uur als live_hour ontbreekt', () => {
    const cells = aggregateDaily(
      [{ captured_at: '2026-10-05T10:20:00Z', live_pct: 44, live_hour: null }],
      null,
    );
    expect(cells[0]).toMatchObject({ day: '2026-10-05', hour: 12 });
  });

  it('is idempotent: dezelfde invoer geeft dezelfde uitvoer', () => {
    const rows = [
      { captured_at: '2026-10-05T10:00:00Z', live_pct: 30, live_hour: 12 },
      { captured_at: '2026-10-05T11:00:00Z', live_pct: 35, live_hour: 13 },
    ];
    expect(aggregateDaily(rows, pattern)).toEqual(
      aggregateDaily([...rows].reverse(), pattern),
    );
  });
});

describe('buildDayContext', () => {
  it('combineert weer, feestdag en evenementen per datum, en laat ontbrekende bronnen leeg', () => {
    const rows = buildDayContext(
      ['2026-10-05', '2026-10-06'],
      new Map([['2026-10-05', { code: 63, tempMax: 12.4, tempMin: 8 }]]),
      new Map([['2026-10-06', 'Testdag']]),
      new Map([
        [
          '2026-10-05',
          [{ name: 'Festival', category: 'festivals', distanceKm: 0.8 }],
        ],
      ]),
    );
    expect(rows[0]).toMatchObject({
      weatherCode: 63,
      tempMax: 12.4,
      holiday: null,
    });
    expect(rows[0].events).toHaveLength(1);
    expect(rows[1]).toMatchObject({
      weatherCode: null,
      tempMax: null,
      holiday: 'Testdag',
      events: [],
    });
  });
});
