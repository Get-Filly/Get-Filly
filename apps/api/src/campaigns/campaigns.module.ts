import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// CampaignsService wordt ook gebruikt door SuggestionsService (voor de
// approve-flow: suggestie → campagne aanmaken + FK koppelen) en door
// ChatService (chat-proposals landen eerst als suggestie, niet direct
// als campagne — maar we houden de export generiek voor toekomstige
// cross-module-gebruik).
//
// AiModule is nodig voor de refine-generator: 3 alternatieven uit
// een bestaande concept-campagne genereren via Claude.
@Module({
  imports: [SupabaseModule, MeModule, AiModule, AuditLogModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, AuthGuard, RestaurantAccessGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
