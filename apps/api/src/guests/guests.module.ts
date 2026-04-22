import { Module } from '@nestjs/common';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [GuestsController],
  providers: [GuestsService, AuthGuard, RestaurantAccessGuard],
})
export class GuestsModule {}
