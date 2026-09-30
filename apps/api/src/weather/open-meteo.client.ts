import type { HourlyWeather } from '../busyness/quiet-signals';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

// ============================================================
// OpenMeteoClient — de pure weerbron (singleton, geen Supabase)
// ============================================================
//
// Waarom apart van WeatherService?
//   WeatherService injecteert RequestSupabaseService en is daarmee
//   Scope.REQUEST (user-JWT + RLS). Elke service die 'm injecteert wordt
//   óók request-scoped. Dat kan niet in BusynessService: die hangt onder
//   de cron-controllers (geen user-JWT, geen request) én wordt als
//   singleton geïnjecteerd in suggestions/ai. De HTTP-call zelf heeft
//   Supabase helemaal niet nodig — alleen lat/lng — dus die staat hier,
//   als gewone singleton. WeatherService delegeert ernaar, de detectie
//   gebruikt 'm rechtstreeks met coördinaten die ze zelf ophaalt.
//
// Cache: getQuietMoments is een hot path (dashboard-render, chat-context,
// per datum in de geleide flow). Zonder cache is één sessie al tien
// Open-Meteo-calls. TTL 30 min op afgeronde coördinaten (~1 km) is ruim
// binnen de verversfrequentie van een daggrove verwachting.

export type ForecastDay = {
  date: string;
  dayLabel: string;
  tempMin: number;
  tempMax: number;
  icon: string;
  description: string;
  /** Ruwe WMO-weercode; de detectie rekent hierop, de UI op icon/description. */
  code: number;
};

const WEATHER_CODES: Record<number, { icon: string; desc: string }> = {
  0: { icon: '☀️', desc: 'Zonnig' },
  1: { icon: '🌤️', desc: 'Overwegend zonnig' },
  2: { icon: '⛅', desc: 'Deels bewolkt' },
  3: { icon: '☁️', desc: 'Bewolkt' },
  45: { icon: '🌫️', desc: 'Mist' },
  48: { icon: '🌫️', desc: 'Mist' },
  51: { icon: '🌦️', desc: 'Lichte motregen' },
  53: { icon: '🌦️', desc: 'Motregen' },
  55: { icon: '🌧️', desc: 'Zware motregen' },
  61: { icon: '🌧️', desc: 'Lichte regen' },
  63: { icon: '🌧️', desc: 'Regen' },
  65: { icon: '🌧️', desc: 'Zware regen' },
  71: { icon: '🌨️', desc: 'Lichte sneeuw' },
  73: { icon: '🌨️', desc: 'Sneeuw' },
  75: { icon: '❄️', desc: 'Zware sneeuw' },
  80: { icon: '🌦️', desc: 'Regenbuien' },
  81: { icon: '🌧️', desc: 'Regenbuien' },
  82: { icon: '⛈️', desc: 'Zware buien' },
  95: { icon: '⛈️', desc: 'Onweer' },
  96: { icon: '⛈️', desc: 'Onweer' },
  99: { icon: '⛈️', desc: 'Zwaar onweer' },
};

const DAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

// Open-Meteo geeft 7 dagen; alles daarbuiten heeft dus geen weersignaal.
export const FORECAST_DAYS = 7;

const CACHE_TTL_MS = 30 * 60 * 1000;

type HourlyResponse = {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    weather_code: (number | null)[];
  };
};

type OpenMeteoResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
};

@Injectable()
export class OpenMeteoClient {
  private readonly logger = new Logger(OpenMeteoClient.name);
  private readonly cache = new Map<
    string,
    { at: number; days: ForecastDay[] }
  >();

  /**
   * Weersverwachting (7 dagen) voor coördinaten. Gooit bij een API-fout —
   * bellers die fail-soft moeten zijn vangen dat zelf af.
   */
  async getForecast(lat: number, lng: number): Promise<ForecastDay[]> {
    // ~2 decimalen ≈ 1 km: fijn genoeg voor een daggrove verwachting en
    // grof genoeg om zaken in dezelfde straat dezelfde cache te geven.
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.days;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,weather_code',
    );
    url.searchParams.set('timezone', 'Europe/Amsterdam');
    url.searchParams.set('forecast_days', String(FORECAST_DAYS));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new InternalServerErrorException(`Weather API fout: ${res.status}`);
    }

    const data = (await res.json()) as OpenMeteoResponse;
    const days = data.daily.time.map((date, i) => {
      const d = new Date(date);
      const code = data.daily.weather_code[i];
      const w = WEATHER_CODES[code] ?? { icon: '🌤️', desc: 'Onbekend' };
      return {
        date,
        dayLabel: DAY_LABELS[d.getDay()],
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        icon: w.icon,
        description: w.desc,
        code,
      };
    });

    this.cache.set(key, { at: Date.now(), days });
    // De cache groeit met het aantal unieke locaties; bij een handvol
    // duizend zaken is dat verwaarloosbaar, maar ruim verlopen entries op
    // zodat een langlopend proces niet ongelimiteerd vasthoudt.
    if (this.cache.size > 500) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      for (const [k, v] of this.cache) if (v.at < cutoff) this.cache.delete(k);
    }
    return days;
  }

  /**
   * Weer per uur (temperatuur en weercode) per datum. `pastDays` en
   * `forecastDays` bepalen het bereik; de sleutel is de Amsterdamse datum.
   * Gooit bij een API-fout; de callers vangen dat af.
   */
  private async fetchHourly(
    lat: number,
    lng: number,
    pastDays: number,
    forecastDays: number,
  ): Promise<Map<string, HourlyWeather>> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set('hourly', 'temperature_2m,weather_code');
    url.searchParams.set('timezone', 'Europe/Amsterdam');
    url.searchParams.set(
      'past_days',
      String(Math.min(92, Math.max(0, pastDays))),
    );
    url.searchParams.set('forecast_days', String(forecastDays));
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new InternalServerErrorException(`Weather API fout: ${res.status}`);
    }
    const data = (await res.json()) as HourlyResponse;
    const out = new Map<string, HourlyWeather>();
    data.hourly.time.forEach((time, i) => {
      const [date, hh] = time.split('T');
      const hour = parseInt(hh.slice(0, 2), 10);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) return;
      let day = out.get(date);
      if (!day) {
        day = {
          temp: new Array<number>(24).fill(NaN),
          code: new Array<number>(24).fill(NaN),
        };
        out.set(date, day);
      }
      const t = data.hourly.temperature_2m[i];
      const c = data.hourly.weather_code[i];
      if (t != null) day.temp[hour] = t;
      if (c != null) day.code[hour] = c;
    });
    return out;
  }

  private readonly hourlyCache = new Map<
    string,
    { at: number; days: Map<string, HourlyWeather> }
  >();

  /**
   * Uurverwachting (7 dagen) voor coördinaten. Nooit een exception: leeg bij
   * een fout, dan valt de detectie terug op het daggemiddelde. Ververst elke
   * 30 minuten, dus bij elke detectie (dashboard, chat en de automatische
   * controle) is het weer per uur actueel.
   */
  async getHourlyForecastSafe(
    lat: number,
    lng: number,
  ): Promise<Map<string, HourlyWeather>> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = this.hourlyCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.days;
    try {
      const days = await this.fetchHourly(lat, lng, 0, FORECAST_DAYS);
      this.hourlyCache.set(key, { at: Date.now(), days });
      if (this.hourlyCache.size > 500) {
        const cutoff = Date.now() - CACHE_TTL_MS;
        for (const [k, v] of this.hourlyCache) {
          if (v.at < cutoff) this.hourlyCache.delete(k);
        }
      }
      return days;
    } catch (e) {
      this.logger.warn(
        `Open-Meteo uurdata faalde (${lat},${lng}): ${String(e)}`,
      );
      return new Map();
    }
  }

  /** Het weer per uur van de afgelopen dagen (tot 92 terug, tot en met vandaag). */
  async getHourlyHistory(
    lat: number,
    lng: number,
    pastDays: number,
  ): Promise<Map<string, HourlyWeather>> {
    return this.fetchHourly(lat, lng, pastDays, 1);
  }

  /**
   * Het weer van de afgelopen dagen (tot 92 dagen terug, tot en met vandaag).
   * Voor het dagoverzicht van de drukte: dan weten we later welk weer een
   * gemeten dag had. Gooit bij een API-fout; de caller vangt dat af.
   */
  async getHistory(
    lat: number,
    lng: number,
    pastDays: number,
  ): Promise<ForecastDay[]> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,weather_code',
    );
    url.searchParams.set('timezone', 'Europe/Amsterdam');
    url.searchParams.set(
      'past_days',
      String(Math.min(92, Math.max(1, pastDays))),
    );
    url.searchParams.set('forecast_days', '1');
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new InternalServerErrorException(`Weather API fout: ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoResponse;
    return data.daily.time.map((date, i) => {
      const d = new Date(date);
      const code = data.daily.weather_code[i];
      const w = WEATHER_CODES[code] ?? { icon: '🌤️', desc: 'Onbekend' };
      return {
        date,
        dayLabel: DAY_LABELS[d.getDay()],
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        icon: w.icon,
        description: w.desc,
        code,
      };
    });
  }

  /** Verwachting voor coördinaten, maar nooit een exception: leeg bij fout. */
  async getForecastSafe(lat: number, lng: number): Promise<ForecastDay[]> {
    try {
      return await this.getForecast(lat, lng);
    } catch (e) {
      this.logger.warn(`Open-Meteo faalde (${lat},${lng}): ${String(e)}`);
      return [];
    }
  }
}
