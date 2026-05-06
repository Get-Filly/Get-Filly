import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingMailService } from './marketing-mail.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

/**
 * MarketingModule, read-only metrics voor de Marketing-hub.
 *
 * Voor fase 1 alleen mail-stats. Sociale-kanalen-services (IG/FB/TikTok)
 * volgen pas na approvals, die hangen we hier dan ook in als extra
 * providers zonder de bestaande mail-flow te raken.
 */
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [MarketingController],
  providers: [MarketingMailService, AuthGuard, RestaurantAccessGuard],
  exports: [MarketingMailService],
})
export class MarketingModule {}
