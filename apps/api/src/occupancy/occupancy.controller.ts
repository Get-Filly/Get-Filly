import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { OccupancyService } from './occupancy.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

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
