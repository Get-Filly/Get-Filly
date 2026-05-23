import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SeoRunner } from './seo.runner';
import { GbpRunner } from './gbp.runner';
import { ReviewsRunner } from './reviews.runner';
import { GeoRunner } from './geo.runner';
import { CompetitorCollector } from './competitor.collector';
import { HEALTH_RUNNERS } from './types';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { GoogleProfileModule } from '../google-profile/google-profile.module';
import { AiModule } from '../ai/ai.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

/**
 * ============================================================
 * HealthModule — Vindbaarheid-health-score (SEO/GBP/Reviews/GEO)
 * ============================================================
 *
 * Runner-DI:
 *   Elke runner is een eigen @Injectable. We bundelen ze via een
 *   custom token (HEALTH_RUNNERS), zodat de HealthService alleen
 *   tegen het array hoeft te programmeren en niet hoeft te weten
 *   welke runners er bestaan. Nieuwe runner toevoegen = in providers
 *   zetten + in het HEALTH_RUNNERS-array opnemen.
 *
 * Imports:
 *   - SupabaseModule        , per-request user-JWT-client (RLS actief).
 *   - MeModule              , RestaurantAccessService voor de guard.
 *   - GoogleProfileModule   , exporteert GoogleProfileService die
 *                              GbpRunner + ReviewsRunner gebruiken voor
 *                              gecachete Place-data (24u TTL).
 *
 * Exports:
 *   HealthService — andere modules (bv. OnboardingModule) kunnen
 *   straks zelf een eerste audit-run triggeren na onboarding.
 */

@Module({
  imports: [SupabaseModule, MeModule, GoogleProfileModule, AiModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    SeoRunner,
    GbpRunner,
    ReviewsRunner,
    GeoRunner,
    CompetitorCollector,
    {
      provide: HEALTH_RUNNERS,
      useFactory: (
        seo: SeoRunner,
        gbp: GbpRunner,
        reviews: ReviewsRunner,
        geo: GeoRunner,
      ) => [seo, gbp, reviews, geo],
      inject: [SeoRunner, GbpRunner, ReviewsRunner, GeoRunner],
    },
    AuthGuard,
    RestaurantAccessGuard,
  ],
  exports: [HealthService],
})
export class HealthModule {}
