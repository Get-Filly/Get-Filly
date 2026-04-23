import { Module } from '@nestjs/common';
import { OccupancyController } from './occupancy.controller';
import { OccupancyService } from './occupancy.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [OccupancyController],
  providers: [OccupancyService, AuthGuard, RestaurantAccessGuard],
  // Exporteren zodat AiModule de service mag hergebruiken voor
  // context-injectie in Filly-prompts (chat, suggesties, campagnes).
  exports: [OccupancyService],
})
export class OccupancyModule {}
