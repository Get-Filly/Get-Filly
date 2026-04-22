import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService, AuthGuard, RestaurantAccessGuard],
})
export class SuggestionsModule {}
