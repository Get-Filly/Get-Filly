import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { OccupancyService } from './occupancy.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('occupancy')
export class OccupancyController {
  constructor(private readonly occupancy: OccupancyService) {}

  @Get()
  getMonth(
    @RestaurantId() restaurantId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.occupancy.getMonth(restaurantId, year, month);
  }
}
