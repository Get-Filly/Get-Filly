import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { OpenMeteoClient } from './open-meteo.client';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [WeatherController],
  providers: [WeatherService, OpenMeteoClient, AuthGuard, BusinessAccessGuard],
  // WeatherService exporteren zodat AiModule de forecast kan ophalen voor
  // context-injectie in Filly-prompts. OpenMeteoClient apart exporteren voor
  // singleton-consumers (BusynessService): WeatherService is request-scoped
  // en zou die services meetrekken, de client niet.
  exports: [WeatherService, OpenMeteoClient],
})
export class WeatherModule {}
