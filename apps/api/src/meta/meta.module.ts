import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
// MeModule exporteert BusinessAccessService, die BusinessAccessGuard
// nodig heeft (zelfde patroon als CampaignsModule).
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { TokenCryptoService } from '../common/token-crypto.service';
import { MetaController } from './meta.controller';
import { MetaWebhookController } from './meta-webhook.controller';
import { MetaService } from './meta.service';

// ============================================================
// MetaModule, Meta (Facebook/Instagram) OAuth-koppeling
// ============================================================
// MetaService injecteert RequestSupabaseService (REQUEST-scoped) →
// de service + controller worden automatisch request-scoped. Dat is
// geïsoleerd tot deze module.
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [MetaController, MetaWebhookController],
  providers: [
    MetaService,
    TokenCryptoService,
    AuthGuard,
    BusinessAccessGuard,
  ],
  // Geëxporteerd zodat CampaignsModule social-campagnes via de bestaande
  // publish-flow naar FB/IG kan plaatsen (hergebruik i.p.v. dupliceren).
  exports: [MetaService],
})
export class MetaModule {}
