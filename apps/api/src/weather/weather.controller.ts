import { Controller, Get, UseGuards } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('me')
  forRestaurant(@BusinessId() businessId: string) {
    return this.weather.getForecastForRestaurant(businessId);
  }
}
