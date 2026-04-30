import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiModule } from '../ai/ai.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';

// OnboardingModule — aparte module omdat het endpoint BUITEN de
// RestaurantAccessGuard-keten valt (user heeft nog geen restaurant).
// Alleen AuthGuard is nodig: de user moet ingelogd zijn.
// AiModule is nodig voor het website-analyse-endpoint.
// GeocodingModule zet adres → lat/long om na het aanmaken van het
// restaurant zodat we direct weer-forecast kunnen ophalen.
// AuditLogModule logt het moment waarop een nieuwe klant 't proces
// heeft afgerond — startpunt voor "klant-since"-metrics en support.
@Module({
  imports: [SupabaseModule, AiModule, GeocodingModule, AuditLogModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, AuthGuard],
})
export class OnboardingModule {}
