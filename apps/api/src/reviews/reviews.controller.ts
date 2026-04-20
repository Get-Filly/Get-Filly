import { Controller, Get } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.reviews.findAll(restaurantId);
  }
}
