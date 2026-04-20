import { Controller, Get, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  findRange(
    @RestaurantId() restaurantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const today = new Date();
    const defaultFrom =
      from ?? today.toISOString().slice(0, 10);
    const defaultTo =
      to ??
      new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    return this.reservations.findRange(restaurantId, defaultFrom, defaultTo);
  }
}
