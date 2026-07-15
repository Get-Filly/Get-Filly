import { Module } from '@nestjs/common';
import { BusynessController } from './busyness.controller';
import { BusynessCronController } from './busyness-cron.controller';
import { BusynessService } from './busyness.service';
import { OutscraperClient } from './outscraper.client';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [BusynessController, BusynessCronController],
  providers: [
    BusynessService,
    OutscraperClient,
    AuthGuard,
    RestaurantAccessGuard,
  ],
  // Exporteren zodat de fase B-backend (Filly-context + auto-detectie)
  // de service later kan hergebruiken.
  exports: [BusynessService],
})
export class BusynessModule {}
