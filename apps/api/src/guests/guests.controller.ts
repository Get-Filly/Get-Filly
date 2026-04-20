import { Controller, Get } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.guests.findAll(restaurantId);
  }
}
