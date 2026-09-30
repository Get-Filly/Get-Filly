import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OpenMeteoClient } from './open-meteo.client';
import type { HourlyWeather } from '../busyness/quiet-signals';

/**
 * ============================================================
 * Weer-opnames: vier vaste metingen per dag (mig 0081)
 * ============================================================
 *
 * De rustige-momenten-detectie leest het weer niet meer live bij elke
 * aanroep, maar uit de laatste opname van dit soort. Een cron neemt vier keer
 * per dag een opname (ochtend, lunch, middag, diner), per locatie en niet per
 * zaak. Dat geeft:
 *   - een vast, voorspelbaar aantal aanroepen (4 per locatie per dag, ongeacht
 *     hoe vaak het dashboard of de chat de detectie draait);
 *   - een weersverwachting die per dagdeel ververst wordt;
 *   - één plek waar we weten welk weer Filly zag.
 * Open-Meteo is gratis voor niet-commercieel gebruik; voor een betaald product
 * is een abonnement nodig (zie BACKLOG). Minder aanroepen houdt dat betaalbaar.
 */
export type WeatherSlot = 'ochtend' | 'lunch' | 'middag' | 'diner';

/** Hoe oud een opname mag zijn voordat we (eenmalig) live bijvullen. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Het dagdeel van dit moment, op Amsterdamse tijd. De crons draaien rond 06:30, 11:30, 14:30 en 17:30. */
export function currentWeatherSlot(now: Date = new Date()): WeatherSlot {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      hour12: false,
    }).format(now),
    10,
  );
  if (hour < 10) return 'ochtend';
  if (hour < 13) return 'lunch';
  if (hour < 16) return 'middag';
  return 'diner';
}

export const locationKey = (lat: number, lng: number): string =>
  `${lat.toFixed(2)},${lng.toFixed(2)}`;

type StoredForecast = Record<
  string,
  { temp: (number | null)[]; code: (number | null)[] }
>;

const toStored = (m: Map<string, HourlyWeather>): StoredForecast => {
  const clean = (a: number[]) => a.map((v) => (Number.isFinite(v) ? v : null));
  const out: StoredForecast = {};
  for (const [date, h] of m)
    out[date] = { temp: clean(h.temp), code: clean(h.code) };
  return out;
};

const fromStored = (s: StoredForecast): Map<string, HourlyWeather> => {
  const nan = (a: (number | null)[]) => a.map((v) => v ?? NaN);
  const out = new Map<string, HourlyWeather>();
  for (const [date, h] of Object.entries(s ?? {})) {
    out.set(date, { temp: nan(h.temp), code: nan(h.code) });
  }
  return out;
};

@Injectable()
export class WeatherSnapshotService {
  private readonly logger = new Logger(WeatherSnapshotService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly openMeteo: OpenMeteoClient,
  ) {}

  /** Neemt een opname voor elke unieke locatie van alle zaken met coördinaten. */
  async refreshAll(slot: WeatherSlot = currentWeatherSlot()): Promise<{
    slot: WeatherSlot;
    locations: number;
    ok: number;
    failed: number;
  }> {
    const { data, error } = await this.supabase.client
      .from('businesses')
      .select('latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    if (error) throw new Error(error.message);

    const locations = new Map<string, { lat: number; lng: number }>();
    for (const r of (data ?? []) as Array<{
      latitude: number;
      longitude: number;
    }>) {
      locations.set(locationKey(r.latitude, r.longitude), {
        lat: r.latitude,
        lng: r.longitude,
      });
    }

    let ok = 0;
    let failed = 0;
    for (const [key, { lat, lng }] of locations) {
      try {
        await this.capture(key, lat, lng, slot);
        ok += 1;
      } catch (e) {
        failed += 1;
        this.logger.warn(`weer-opname faalde voor ${key}: ${String(e)}`);
      }
    }
    this.logger.log(`weer-opnames (${slot}): ${ok}/${locations.size} gelukt.`);
    return { slot, locations: locations.size, ok, failed };
  }

  /**
   * Het uurweer (7 dagen) voor een locatie, uit de laatste opname. Ontbreekt
   * die of is hij ouder dan 24 uur, dan vullen we eenmalig live bij (zodat een
   * nieuwe zaak meteen weer heeft). Nooit een exception: leeg bij een fout,
   * dan draait de detectie zonder weersignaal.
   */
  async getHourly(
    lat: number,
    lng: number,
  ): Promise<Map<string, HourlyWeather>> {
    const key = locationKey(lat, lng);
    try {
      const { data } = await this.supabase.client
        .from('weather_forecasts')
        .select('forecast, captured_at')
        .eq('location_key', key)
        .maybeSingle();
      const row = data as {
        forecast: StoredForecast;
        captured_at: string;
      } | null;
      if (row && Date.now() - Date.parse(row.captured_at) < MAX_AGE_MS) {
        return fromStored(row.forecast);
      }
      return await this.capture(key, lat, lng, currentWeatherSlot());
    } catch (e) {
      this.logger.warn(`uurweer ophalen faalde (${key}): ${String(e)}`);
      return new Map();
    }
  }

  private async capture(
    key: string,
    lat: number,
    lng: number,
    slot: WeatherSlot,
  ): Promise<Map<string, HourlyWeather>> {
    const forecast = await this.openMeteo.getHourlyForecast(lat, lng);
    const { error } = await this.supabase.client
      .from('weather_forecasts')
      .upsert(
        {
          location_key: key,
          slot,
          captured_at: new Date().toISOString(),
          forecast: toStored(forecast),
        },
        { onConflict: 'location_key' },
      );
    if (error) throw new Error(error.message);
    return forecast;
  }
}
