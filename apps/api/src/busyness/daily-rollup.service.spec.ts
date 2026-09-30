import { BusynessService } from './busyness.service';

// Fake Supabase: elke tabel geeft vaste rijen terug, en upserts worden
// onthouden zodat we kunnen nakijken wat er weggeschreven zou worden.
function fakeSupabase(tables: Record<string, unknown[]>) {
  const upserts: Record<string, unknown[]> = {};
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'not', 'gte', 'lte', 'or', 'in'])
      b[m] = chain;
    b.maybeSingle = () =>
      Promise.resolve({ data: rows[0] ?? null, error: null });
    b.upsert = (payload: unknown[]) => {
      upserts[table] = [...(upserts[table] ?? []), ...payload];
      return Promise.resolve({ error: null });
    };
    b.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
    return b;
  };
  return { client: { from }, upserts };
}

describe('rollupDaily', () => {
  it('schrijft het dagoverzicht en de dagcontext weg', async () => {
    const sb = fakeSupabase({
      businesses: [{ id: 'b1', latitude: 52.1, longitude: 4.5 }],
      busyness_snapshots: [
        { captured_at: '2026-09-28T10:05:00Z', live_pct: 40, live_hour: 12 },
        { captured_at: '2026-09-28T10:35:00Z', live_pct: 60, live_hour: 12 },
      ],
      busyness_day_context: [],
    });
    const events = {
      findNearbyInRange: jest.fn().mockResolvedValue([
        {
          name: 'Festival',
          category: 'festivals',
          place: 'x',
          startsOn: '2026-09-28',
          distanceKm: 0.8,
          sourceUrl: '',
        },
      ]),
    };
    const openMeteo = {
      getHistory: jest
        .fn()
        .mockResolvedValue([
          { date: '2026-09-28', code: 63, tempMax: 14, tempMin: 9 },
        ]),
    };
    const svc = new BusynessService(
      sb as never,
      {} as never,
      events as never,
      openMeteo as never,
      {} as never,
    );
    const pattern = Array.from({ length: 7 }, () =>
      new Array<number>(24).fill(0),
    );
    pattern[0][12] = 55; // 28 sept 2026 is een maandag
    jest.spyOn(svc, 'getLatest').mockResolvedValue({
      pattern,
      openingHours: null,
      livePct: null,
      liveHour: null,
      liveWeekday: null,
      capturedAt: null,
    });

    const res = await svc.rollupDaily();
    expect(res).toEqual({ businesses: 1, rows: 1, failed: 0 });
    expect(sb.upserts.busyness_daily).toEqual([
      expect.objectContaining({
        business_id: 'b1',
        day: '2026-09-28',
        weekday: 0,
        hour: 12,
        actual_pct: 50,
        expected_pct: 55,
        measurements: 2,
      }),
    ]);
    expect(sb.upserts.busyness_day_context).toEqual([
      expect.objectContaining({
        business_id: 'b1',
        day: '2026-09-28',
        weather_code: 63,
        temp_max: 14,
        holiday: null,
        events: [{ name: 'Festival', category: 'festivals', distanceKm: 0.8 }],
      }),
    ]);
  });

  it('bewaart de drukte ook als het weer niet op te halen is', async () => {
    const sb = fakeSupabase({
      businesses: [{ id: 'b1', latitude: 52.1, longitude: 4.5 }],
      busyness_snapshots: [
        { captured_at: '2026-09-28T10:05:00Z', live_pct: 40, live_hour: 12 },
      ],
      busyness_day_context: [],
    });
    const events = {
      findNearbyInRange: jest.fn().mockRejectedValue(new Error('boem')),
    };
    const openMeteo = {
      getHistory: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const svc = new BusynessService(
      sb as never,
      {} as never,
      events as never,
      openMeteo as never,
      {} as never,
    );
    jest.spyOn(svc, 'getLatest').mockResolvedValue({
      pattern: null,
      openingHours: null,
      livePct: null,
      liveHour: null,
      liveWeekday: null,
      capturedAt: null,
    } as never);

    const res = await svc.rollupDaily();
    expect(res.failed).toBe(0);
    expect(sb.upserts.busyness_daily).toHaveLength(1);
    expect(sb.upserts.busyness_day_context).toEqual([
      expect.objectContaining({ weather_code: null, events: [] }),
    ]);
  });
});
