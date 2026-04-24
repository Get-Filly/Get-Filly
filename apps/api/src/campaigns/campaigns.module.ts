import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// CampaignsService wordt ook gebruikt door SuggestionsService (voor de
// approve-flow: suggestie → campagne aanmaken + FK koppelen) en door
// ChatService (chat-proposals landen eerst als suggestie, niet direct
// als campagne — maar we houden de export generiek voor toekomstige
// cross-module-gebruik).
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, AuthGuard, RestaurantAccessGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
