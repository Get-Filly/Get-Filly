import { Controller, Get, UseGuards } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

/**
 * KpiController, dashboard-KPI's voor het actieve restaurant.
 *
 * Twee guards in deze volgorde:
 *   1. AuthGuard           , verifieert JWT, zet req.user.
 *   2. BusinessAccessGuard, leest X-Business-Id header,
 *                              controleert dat user toegang heeft,
 *                              zet req.restaurant.
 *
 * @BusinessId() leest vervolgens de businessId uit req.restaurant.
 * Geen header = 400, geen toegang = 403.
 */
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  getKpis(@BusinessId() businessId: string) {
    return this.kpi.getKpis(businessId);
  }

  // Filly-ROI: per-campagne aggregaties van deze maand. Door rapportages
  // gebruikt voor de "per kanaal"-tabel. Alleen campagnes waar minstens
  // 1 reservering aan gekoppeld is verschijnen, geen lege rijen.
  @Get('filly-attribution')
  getCampaignAttribution(@BusinessId() businessId: string) {
    return this.kpi.getCampaignAttributionThisMonth(businessId);
  }

  // Filly-ROI: 6-maanden bucket-data voor de bar-grafiek op rapportages.
  @Get('filly-roi-6m')
  getFillyRoi6Months(@BusinessId() businessId: string) {
    return this.kpi.getFillyRoi6Months(businessId);
  }
}
