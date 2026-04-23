import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

@Module({
  imports: [SupabaseModule, MeModule, AiModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, AuthGuard, RestaurantAccessGuard, AiRateLimitGuard],
})
export class ReviewsModule {}
