import { Controller, Get, UseGuards } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

/**
 * KpiController — dashboard-KPI's voor het actieve restaurant.
 *
 * Twee guards in deze volgorde:
 *   1. AuthGuard            — verifieert JWT, zet req.user.
 *   2. RestaurantAccessGuard — leest X-Restaurant-Id header,
 *                              controleert dat user toegang heeft,
 *                              zet req.restaurant.
 *
 * @RestaurantId() leest vervolgens de restaurantId uit req.restaurant.
 * Geen header = 400, geen toegang = 403.
 */
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  getKpis(@RestaurantId() restaurantId: string) {
    return this.kpi.getKpis(restaurantId);
  }
}
