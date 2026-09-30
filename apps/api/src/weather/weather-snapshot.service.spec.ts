import {
  WeatherSnapshotService,
  currentWeatherSlot,
  locationKey,
} from './weather-snapshot.service';

const uur = (waarde: number) => ({
  temp: new Array<number>(24).fill(waarde),
  code: new Array<number>(24).fill(3),
});

function fakeSupabase(row: unknown, locaties: unknown[] = []) {
  const upserts: unknown[] = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: row, error: null });
    b.upsert = (payload: unknown) => {
      upserts.push({ table, payload });
      return Promise.resolve({ error: null });
    };
    b.then = (res: (v: unknown) => unknown) =>
      res({ data: table === 'businesses' ? locaties : [], error: null });
    return b;
  };
  return { client: { from }, upserts };
}

describe('currentWeatherSlot', () => {
  it('kiest het dagdeel op Amsterdamse tijd (zomer- en wintertijd)', () => {
    // 06:30 zomertijd = 04:30 UTC; 05:30 wintertijd = 04:30 UTC
    expect(currentWeatherSlot(new Date('2026-07-01T04:30:00Z'))).toBe(
      'ochtend',
    );
    expect(currentWeatherSlot(new Date('2026-12-01T04:30:00Z'))).toBe(
      'ochtend',
    );
    expect(currentWeatherSlot(new Date('2026-07-01T09:30:00Z'))).toBe('lunch');
    expect(currentWeatherSlot(new Date('2026-12-01T09:30:00Z'))).toBe('lunch');
    expect(currentWeatherSlot(new Date('2026-07-01T12:30:00Z'))).toBe('middag');
    expect(currentWeatherSlot(new Date('2026-12-01T12:30:00Z'))).toBe('middag');
    expect(currentWeatherSlot(new Date('2026-07-01T15:30:00Z'))).toBe('diner');
    expect(currentWeatherSlot(new Date('2026-12-01T15:30:00Z'))).toBe('diner');
  });
});

describe('WeatherSnapshotService', () => {
  it('leest een verse opname uit de database zonder Open-Meteo aan te roepen', async () => {
    const row = {
      captured_at: new Date().toISOString(),
      forecast: {
        '2026-10-05': {
          temp: new Array(24).fill(11),
          code: new Array(24).fill(63),
        },
      },
    };
    const sb = fakeSupabase(row);
    const client = { getHourlyForecast: jest.fn() };
    const svc = new WeatherSnapshotService(sb as never, client as never);
    const res = await svc.getHourly(52.37, 4.9);
    expect(client.getHourlyForecast).not.toHaveBeenCalled();
    expect(res.get('2026-10-05')!.code[12]).toBe(63);
  });

  it('vult eenmalig live bij als er geen opname is en bewaart die', async () => {
    const sb = fakeSupabase(null);
    const client = {
      getHourlyForecast: jest
        .fn()
        .mockResolvedValue(new Map([['2026-10-05', uur(15)]])),
    };
    const svc = new WeatherSnapshotService(sb as never, client as never);
    const res = await svc.getHourly(52.37, 4.9);
    expect(client.getHourlyForecast).toHaveBeenCalledTimes(1);
    expect(res.get('2026-10-05')!.temp[10]).toBe(15);
    expect(sb.upserts).toHaveLength(1);
  });

  it('geeft een lege verwachting als alles faalt (nooit een exception)', async () => {
    const sb = fakeSupabase(null);
    const client = {
      getHourlyForecast: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const svc = new WeatherSnapshotService(sb as never, client as never);
    expect((await svc.getHourly(52.37, 4.9)).size).toBe(0);
  });

  it('neemt per unieke locatie een opname, ook als meerdere zaken daar zitten', async () => {
    const sb = fakeSupabase(null, [
      { latitude: 52.371, longitude: 4.901 },
      { latitude: 52.372, longitude: 4.902 }, // zelfde locatie op twee decimalen
      { latitude: 51.5, longitude: 5.5 },
    ]);
    const client = {
      getHourlyForecast: jest
        .fn()
        .mockResolvedValue(new Map([['2026-10-05', uur(10)]])),
    };
    const svc = new WeatherSnapshotService(sb as never, client as never);
    const res = await svc.refreshAll('lunch');
    expect(res).toEqual({ slot: 'lunch', locations: 2, ok: 2, failed: 0 });
    expect(client.getHourlyForecast).toHaveBeenCalledTimes(2);
    expect(locationKey(52.371, 4.901)).toBe('52.37,4.90');
  });
});
