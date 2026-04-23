import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [WeatherController],
  providers: [WeatherService, AuthGuard, RestaurantAccessGuard],
  // Exporteren zodat AiModule de forecast kan ophalen voor context-
  // injectie in Filly-prompts.
  exports: [WeatherService],
})
export class WeatherModule {}
