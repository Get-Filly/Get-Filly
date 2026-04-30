import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.reviews.findAll(restaurantId);
  }

  // POST (geen GET) omdat deze call Claude aanroept en dus geld kost +
  // side-effects heeft (tokens verbruiken, logging). GET hoort idempotent
  // en gratis te zijn. Frontend stuurt gewoon een body-loze POST.
  //
  // Extra AiRateLimitGuard bovenop de al geldige class-level guards:
  // deze telt hoeveel AI-calls dit restaurant dit uur al deed en gooit
  // 429 als het limiet (100/uur) is bereikt. Zo beschermen we tegen
  // scripts of abuse-scenario's die onze Anthropic-rekening laten
  // exploderen.
  @UseGuards(AiRateLimitGuard)
  @Post(':id/reply-suggestion')
  generateReplySuggestion(
    @RestaurantId() restaurantId: string,
    @Param('id') reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.generateReplySuggestion(
      restaurantId,
      reviewId,
      user.id,
    );
  }

  // Lees gecachte filly-varianten + meta. Géén Claude-call (gratis),
  // dus geen rate-limit guard nodig.
  @Get(':id/variants')
  getVariants(
    @RestaurantId() restaurantId: string,
    @Param('id') reviewId: string,
  ) {
    return this.reviews.getVariants(restaurantId, reviewId);
  }

  // Genereert 3 alternatieve reactie-varianten en cachet ze. Eerste
  // call: 3. Tweede: 3 extra (totaal 6). Daarna BadRequest. Wel
  // rate-limit-guard want dit is een Claude-call.
  @UseGuards(AiRateLimitGuard)
  @Post(':id/refine')
  refineVariants(
    @RestaurantId() restaurantId: string,
    @Param('id') reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.refineVariants(restaurantId, reviewId, user.id);
  }

  // PATCH omdat we een bestaand record gedeeltelijk aanpassen (alleen
  // response_text + responded_at). PUT zou "vervang alles" betekenen.
  @Patch(':id')
  updateResponse(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') reviewId: string,
    @Body() body: { response_text: string },
  ) {
    return this.reviews.updateResponse(
      restaurantId,
      reviewId,
      body.response_text,
      user.id,
    );
  }
}
