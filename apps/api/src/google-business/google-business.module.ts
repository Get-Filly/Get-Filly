import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
// MeModule exporteert RestaurantAccessService, die RestaurantAccessGuard
// nodig heeft (zelfde patroon als MetaModule / CampaignsModule).
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { TokenCryptoService } from '../common/token-crypto.service';
import { GoogleBusinessController } from './google-business.controller';
import { GoogleBusinessService } from './google-business.service';

// ============================================================
// GoogleBusinessModule, Google Bedrijfsprofiel OAuth-koppeling
// ============================================================
// GoogleBusinessService injecteert RequestSupabaseService (REQUEST-
// scoped) -> service + controller worden automatisch request-scoped.
// We exporteren de service zodat reviews-/posts-modules straks
// getAccessToken(restaurantId) kunnen gebruiken om namens de zaak te
// handelen.
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [GoogleBusinessController],
  providers: [
    GoogleBusinessService,
    TokenCryptoService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
  exports: [GoogleBusinessService],
})
export class GoogleBusinessModule {}
