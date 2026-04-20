import { Controller, Get } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  getKpis(@RestaurantId() restaurantId: string) {
    return this.kpi.getKpis(restaurantId);
  }
}
