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

  // Filly-ROI: per-campagne aggregaties van deze maand. Door rapportages
  // gebruikt voor de "per kanaal"-tabel. Alleen campagnes waar minstens
  // 1 reservering aan gekoppeld is verschijnen — geen lege rijen.
  @Get('filly-attribution')
  getCampaignAttribution(@RestaurantId() restaurantId: string) {
    return this.kpi.getCampaignAttributionThisMonth(restaurantId);
  }

  // Filly-ROI: 6-maanden bucket-data voor de bar-grafiek op rapportages.
  @Get('filly-roi-6m')
  getFillyRoi6Months(@RestaurantId() restaurantId: string) {
    return this.kpi.getFillyRoi6Months(restaurantId);
  }
}
