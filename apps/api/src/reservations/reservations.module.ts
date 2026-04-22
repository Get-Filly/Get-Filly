import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, AuthGuard, RestaurantAccessGuard],
})
export class ReservationsModule {}
