import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { TokenCryptoService } from '../common/token-crypto.service';
import { TikTokController } from './tiktok.controller';
import { TikTokService } from './tiktok.service';

// ============================================================
// TikTokModule, TikTok (Login Kit + Content Posting API)-koppeling
// ============================================================
// Spiegelt MetaModule. TikTokService injecteert RequestSupabaseService
// (REQUEST-scoped) → service + controller worden request-scoped, geïsoleerd
// tot deze module. Geëxporteerd zodat de campagne-/upload-flow 'm later
// kan hergebruiken (fase 2: posten naar de inbox).
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [TikTokController],
  providers: [
    TikTokService,
    TokenCryptoService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
  exports: [TikTokService],
})
export class TikTokModule {}
