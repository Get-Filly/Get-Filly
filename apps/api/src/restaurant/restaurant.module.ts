import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, AuthGuard, RestaurantAccessGuard],
})
export class RestaurantModule {}
