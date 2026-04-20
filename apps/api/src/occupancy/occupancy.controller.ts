import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { OccupancyService } from './occupancy.service';

@Controller('occupancy')
export class OccupancyController {
  constructor(private readonly occupancy: OccupancyService) {}

  @Get()
  getMonth(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.occupancy.getMonth(year, month);
  }
}
