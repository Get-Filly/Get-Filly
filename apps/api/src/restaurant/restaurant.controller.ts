import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get('me')
  getMe(@RestaurantId() restaurantId: string) {
    return this.restaurant.getById(restaurantId);
  }

  @Patch('me')
  updateMe(
    @RestaurantId() restaurantId: string,
    @Body() updates: Record<string, unknown>,
  ) {
    return this.restaurant.update(restaurantId, updates);
  }
}
