import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MarketingMailService } from './marketing-mail.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

/**
 * ============================================================
 * MarketingController, read-only stats voor de Marketing-hub
 * ============================================================
 *
 * Voor MVP alleen mail-stats. Sociale kanalen (IG/FB/TikTok) krijgen
 * later aparte endpoints zodra OAuth + API-koppelingen live zijn.
 *
 * Endpoints:
 *   GET /marketing/mail/stats?days=30       , aggregaat metrics
 *   GET /marketing/mail/campaigns?days=90   , per-campagne tabel
 *
 * Default-perioden bewust verschillend:
 *   stats: 30 dagen, voor bovenste KPI-tegels (recent + actueel)
 *   campaigns: 90 dagen, wil je voor de tabel meer historie zien
 * ============================================================
 */
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('marketing')
export class MarketingController {
  constructor(private readonly mail: MarketingMailService) {}

  @Get('mail/stats')
  getMailStats(
    @BusinessId() businessId: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = daysRaw ? Math.max(1, Math.min(365, parseInt(daysRaw, 10))) : 30;
    return this.mail.getMailStats(businessId, days);
  }

  @Get('mail/campaigns')
  getMailCampaigns(
    @BusinessId() businessId: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = daysRaw ? Math.max(1, Math.min(365, parseInt(daysRaw, 10))) : 90;
    return this.mail.getCampaignMailStats(businessId, days);
  }
}
