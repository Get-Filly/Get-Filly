import { Controller, Get, UseGuards } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('me')
  forRestaurant(@RestaurantId() restaurantId: string) {
    return this.weather.getForecastForRestaurant(restaurantId);
  }
}
