import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HealthService } from './health.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

/**
 * ============================================================
 * HealthController, REST-endpoints voor de Vindbaarheid-hub
 * ============================================================
 *
 * Endpoints (allemaal AuthGuard + BusinessAccessGuard):
 *
 *   POST  /health/run          , nieuwe audit-run starten (manual)
 *   GET   /health/latest       , laatste snapshot + findings + concurrenten
 *   GET   /health/history      , laatste N snapshots zonder findings (trend-chart)
 *
 * Een handmatige run kan een paar seconden duren (alle runners
 * parallel, maar Places + Claude tikken zelf seconden aan). Front-end
 * laat een progress-state zien tot deze POST returnt.
 *
 * Latere uitbreiding (stap 9):
 *   POST /health/run/batch — pg_cron triggert dit endpoint voor
 *   alle restaurants. Beveiligd met een aparte cron-secret in header.
 * ============================================================
 */
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  /**
   * Trigger een nieuwe audit-run. Returnt het volledige snapshot
   * zodat de UI meteen kan herrenderen zonder extra GET.
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(@BusinessId() businessId: string) {
    return this.service.run(businessId, 'manual');
  }

  /**
   * Laatste snapshot. Returnt null als er nog nooit een run is
   * geweest — front-end toont dan een "Run je eerste audit"-CTA.
   */
  @Get('latest')
  getLatest(@BusinessId() businessId: string) {
    return this.service.getLatest(businessId);
  }

  /**
   * Laatste N snapshots zonder findings, voor de trend-grafiek.
   * Default 12 (≈ 3 maanden bij wekelijkse run). Max 52 (1 jaar).
   */
  @Get('history')
  getHistory(
    @BusinessId() businessId: string,
    @Query('limit') limit?: string,
  ) {
    // Parse + clamp; we vertrouwen geen rauwe query-strings van de client.
    const parsed = limit ? Number.parseInt(limit, 10) : 12;
    const safe = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 52)
      : 12;
    return this.service.getHistory(businessId, safe);
  }
}
