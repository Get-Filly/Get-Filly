import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';

@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get('me')
  getMe() {
    return this.restaurant.getMe();
  }

  @Patch('me')
  updateMe(@Body() updates: Record<string, unknown>) {
    return this.restaurant.updateMe(updates);
  }
}
