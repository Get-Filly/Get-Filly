import { Controller, Get, UseGuards } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.guests.findAll(restaurantId);
  }
}
