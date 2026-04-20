import { Controller, Get } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('me')
  forRestaurant(@RestaurantId() restaurantId: string) {
    return this.weather.getForecastForRestaurant(restaurantId);
  }
}
