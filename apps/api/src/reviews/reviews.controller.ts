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
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

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
  @Post(':id/reply-suggestion')
  generateReplySuggestion(
    @RestaurantId() restaurantId: string,
    @Param('id') reviewId: string,
  ) {
    return this.reviews.generateReplySuggestion(restaurantId, reviewId);
  }

  // PATCH omdat we een bestaand record gedeeltelijk aanpassen (alleen
  // response_text + responded_at). PUT zou "vervang alles" betekenen.
  @Patch(':id')
  updateResponse(
    @RestaurantId() restaurantId: string,
    @Param('id') reviewId: string,
    @Body() body: { response_text: string },
  ) {
    return this.reviews.updateResponse(
      restaurantId,
      reviewId,
      body.response_text,
    );
  }
}
