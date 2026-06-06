import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
// MeModule exporteert RestaurantAccessService, die RestaurantAccessGuard
// nodig heeft (zelfde patroon als CampaignsModule).
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { TokenCryptoService } from '../common/token-crypto.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

// ============================================================
// MetaModule, Meta (Facebook/Instagram) OAuth-koppeling
// ============================================================
// MetaService injecteert RequestSupabaseService (REQUEST-scoped) →
// de service + controller worden automatisch request-scoped. Dat is
// geïsoleerd tot deze module.
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [MetaController],
  providers: [
    MetaService,
    TokenCryptoService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
})
export class MetaModule {}
