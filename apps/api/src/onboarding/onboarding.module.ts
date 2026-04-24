import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthGuard } from '../common/auth.guard';

// OnboardingModule — aparte module omdat het endpoint BUITEN de
// RestaurantAccessGuard-keten valt (user heeft nog geen restaurant).
// Alleen AuthGuard is nodig: de user moet ingelogd zijn.
@Module({
  imports: [SupabaseModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, AuthGuard],
})
export class OnboardingModule {}
