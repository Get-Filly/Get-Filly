import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { OccupancyService } from './occupancy.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('occupancy')
export class OccupancyController {
  constructor(private readonly occupancy: OccupancyService) {}

  @Get()
  getMonth(
    @BusinessId() businessId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.occupancy.getMonth(businessId, year, month);
  }
}
