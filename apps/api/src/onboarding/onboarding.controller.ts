import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OnboardingService, type OnboardingInput } from './onboarding.service';
import { AuthGuard } from '../common/auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// ============================================================
// /api/onboarding — eenmalige setup voor nieuwe users
// ============================================================
// Deze controller staat BEWUST buiten de RestaurantAccessGuard-keten
// (anders dan alle andere restaurant-endpoints). Reden: tijdens
// onboarding HEEFT de user nog geen restaurant — hij maakt 'm net
// aan. Dus we kunnen niet eisen dat X-Restaurant-Id meegestuurd wordt.
//
// Wel AuthGuard: de user moet ingelogd zijn (JWT valide).
// ============================================================

@UseGuards(AuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('restaurant')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OnboardingInput,
  ) {
    return this.onboarding.completeOnboarding(user.id, body);
  }
}
