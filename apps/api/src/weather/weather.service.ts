import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type ForecastDay = {
  date: string;
  dayLabel: string;
  tempMin: number;
  tempMax: number;
  icon: string;
  description: string;
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

type OpenMeteoResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
};

@Injectable()
export class WeatherService {
  constructor(private readonly supabase: SupabaseService) {}

  async getForecastForRestaurant(restaurantId: string): Promise<ForecastDay[]> {
    const { data: restaurant, error } = await this.supabase.client
      .from('restaurants')
      .select('latitude, longitude')
      .eq('id', restaurantId)
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    // Als coördinaten ontbreken geven we bewust een LEGE forecast
    // terug, geen 500. Dit gebeurt standaard bij een vers onboarded
    // restaurant waar we nog geen geocoding op het adres hebben
    // gedaan. Zodra BACKLOG-item "geocoding bij adres-invoer" staat,
    // krijgen nieuwe restaurants direct lat/long en komt dit pad
    // nergens meer langs.
    if (!restaurant?.latitude || !restaurant?.longitude) {
      return [];
    }

    return this.getForecast(
      Number(restaurant.latitude),
      Number(restaurant.longitude),
    );
  }

  async getForecast(lat: number, lng: number): Promise<ForecastDay[]> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,weather_code',
    );
    url.searchParams.set('timezone', 'Europe/Amsterdam');
    url.searchParams.set('forecast_days', '7');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new InternalServerErrorException(
        `Weather API fout: ${res.status}`,
      );
    }

    const data: OpenMeteoResponse = await res.json();
    const days = data.daily.time;

    return days.map((date, i) => {
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
      };
    });
  }
}
