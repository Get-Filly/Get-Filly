import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
