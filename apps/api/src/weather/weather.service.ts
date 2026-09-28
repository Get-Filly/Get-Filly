import { Injectable, InternalServerErrorException } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { OpenMeteoClient, type ForecastDay } from './open-meteo.client';

// ForecastDay woont sinds 2026-09-15 in open-meteo.client.ts (de pure,
// singleton bron). Hier her-exporteren zodat bestaande imports
// (`from '../weather/weather.service'`) blijven werken.
export type { ForecastDay };

@Injectable()
export class WeatherService {
  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly openMeteo: OpenMeteoClient,
  ) {}

  async getForecastForRestaurant(businessId: string): Promise<ForecastDay[]> {
    const { data: restaurant, error } = await this.supabase.client
      .from('businesses')
      .select('latitude, longitude')
      .eq('id', businessId)
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
    return this.openMeteo.getForecast(lat, lng);
  }
}
