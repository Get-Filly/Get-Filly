import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

// AuditLogModule logt het opslaan van een review-antwoord, straks
// (zodra OAuth-publish leeft) ook publiek zichtbaar, dus auditbaarheid
// is belangrijk om te kunnen zien wié welk antwoord publiceerde.
@Module({
  imports: [SupabaseModule, MeModule, AiModule, AuditLogModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, AuthGuard, RestaurantAccessGuard, AiRateLimitGuard],
})
export class ReviewsModule {}
