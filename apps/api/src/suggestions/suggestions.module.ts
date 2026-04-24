import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// CampaignsModule importeren zodat de approve-flow (suggestie →
// campagne aanmaken + FK koppelen) CampaignsService kan gebruiken.
// Export van SuggestionsService maakt 'm beschikbaar voor ChatModule
// die bij chat-proposals nieuwe suggesties aanmaakt.
@Module({
  imports: [SupabaseModule, MeModule, CampaignsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService, AuthGuard, RestaurantAccessGuard],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
