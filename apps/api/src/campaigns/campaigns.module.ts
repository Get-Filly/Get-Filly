import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsCronController } from './campaigns-cron.controller';
import { PublicMediaController } from './public-media.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignPerformanceService } from './campaign-performance.service';
import { CampaignFingerprintService } from './campaign-fingerprint.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AnonymizationModule } from '../anonymization/anonymization.module';
import { MailModule } from '../mail/mail.module';
import { EventsModule } from '../events/events.module';
// MetaModule levert MetaService: social-campagnes publiceren naar FB/IG.
import { MetaModule } from '../meta/meta.module';
// TikTokModule levert TikTokService: social-campagnes (platform 'tiktok')
// publiceren via Direct Post.
import { TikTokModule } from '../tiktok/tiktok.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// CampaignsService wordt ook gebruikt door SuggestionsService (voor de
// approve-flow: suggestie → campagne aanmaken + FK koppelen) en door
// ChatService (chat-proposals landen eerst als suggestie, niet direct
// als campagne, maar we houden de export generiek voor toekomstige
// cross-module-gebruik).
//
// AiModule is nodig voor de refine-generator: 3 alternatieven uit
// een bestaande concept-campagne genereren via Claude.
@Module({
  imports: [
    SupabaseModule,
    MeModule,
    AiModule,
    AuditLogModule,
    AnonymizationModule,
    MailModule,
    EventsModule,
    MetaModule,
    TikTokModule,
  ],
  controllers: [
    CampaignsController,
    CampaignsCronController,
    PublicMediaController,
  ],
  providers: [
    CampaignsService,
    CampaignPerformanceService,
    CampaignFingerprintService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
  exports: [
    CampaignsService,
    CampaignPerformanceService,
    CampaignFingerprintService,
  ],
})
export class CampaignsModule {}
