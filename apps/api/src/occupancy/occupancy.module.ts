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
})
export class OccupancyModule {}
