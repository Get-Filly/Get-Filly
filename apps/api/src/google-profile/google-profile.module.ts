import { Module } from '@nestjs/common';
import { GoogleProfileService } from './google-profile.service';
import { GoogleProfileController } from './google-profile.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogModule } from '../common/audit-log.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

/**
 * GoogleProfileModule, wrapper rond Google Places API (New).
 *
 * Imports:
 *   - SupabaseModule      , voor RequestSupabaseService (per-request
 *                            user-JWT-client met RLS-defense-in-depth).
 *   - AuditLogModule      , connect/refresh/disconnect worden gelogd.
 *   - MeModule            , levert RestaurantAccessService voor de
 *                            RestaurantAccessGuard.
 *
 * Exports:
 *   GoogleProfileService, zodat de OnboardingModule (later) hem kan
 *   gebruiken voor auto-detect tijdens onboarding-stap 2.
 */
@Module({
  imports: [SupabaseModule, AuditLogModule, MeModule],
  controllers: [GoogleProfileController],
  providers: [GoogleProfileService, AuthGuard, RestaurantAccessGuard],
  exports: [GoogleProfileService],
})
export class GoogleProfileModule {}
