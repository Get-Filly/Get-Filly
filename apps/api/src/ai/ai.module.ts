import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { RestaurantContextService } from './restaurant-context.service';
import { ChannelReachService } from './channel-reach.service';
import { WebsiteAnalyzerService } from './website-analyzer.service';
import { MenuImporterService } from './menu-importer.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { OccupancyModule } from '../occupancy/occupancy.module';
import { WeatherModule } from '../weather/weather.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { BusynessModule } from '../busyness/busyness.module';

// AiModule levert twee services aan de rest van de app:
//   - AiService: centrale Claude-wrapper (generate + auto-logging)
//   - RestaurantContextService: batch-ophaal van actuele restaurant-
//     feiten (weer/bezetting/reserveringen) voor in AI-prompts
//
// SupabaseModule → ai_usage logging
// Occupancy/Weather/Reservations → contextdata voor Filly-prompts
@Module({
  imports: [
    SupabaseModule,
    OccupancyModule,
    WeatherModule,
    ReservationsModule,
    BusynessModule,
  ],
  providers: [
    AiService,
    RestaurantContextService,
    ChannelReachService,
    WebsiteAnalyzerService,
    MenuImporterService,
  ],
  exports: [
    AiService,
    RestaurantContextService,
    ChannelReachService,
    WebsiteAnalyzerService,
    MenuImporterService,
  ],
})
export class AiModule {}
