import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// CampaignsModule: approve-flow (suggestie → campagne aanmaken + FK
// koppelen).
// AiModule: refine-flow (Filly past suggestie aan op verzoek van de
// eigenaar via een side-chat per suggestie).
// Export van SuggestionsService voor ChatModule.
@Module({
  imports: [SupabaseModule, MeModule, CampaignsModule, AiModule, EventsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService, AuthGuard, RestaurantAccessGuard],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
