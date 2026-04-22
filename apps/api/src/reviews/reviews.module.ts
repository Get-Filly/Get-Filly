import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, AuthGuard, RestaurantAccessGuard],
})
export class ReviewsModule {}
