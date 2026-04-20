import { Controller, Get } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('me')
  forRestaurant() {
    return this.weather.getForecastForRestaurant();
  }
}
