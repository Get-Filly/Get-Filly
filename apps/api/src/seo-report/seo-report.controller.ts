import {
  Controller,
  Get,
  Headers,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeBearer } from '../common/cron-secret';
import { SeoReportService } from './seo-report.service';

// ============================================================
// Wekelijks vindbaarheid-rapport — cron-endpoint (PUBLIEK)
// ============================================================
// Geen AuthGuard: dit wordt door Vercel Cron aangeroepen, niet door een
// ingelogde user. Vercel zet bij cron-aanroepen automatisch
// `Authorization: Bearer <CRON_SECRET>` als CRON_SECRET in de env staat.
// Zonder geldige secret → 401. (AuthGuard is niet globaal, dus zonder
// @UseGuards is deze route publiek; de secret-check is de beveiliging.)
@Controller('seo-report')
export class SeoReportController {
  private readonly logger = new Logger(SeoReportController.name);

  constructor(
    private readonly service: SeoReportService,
    private readonly config: ConfigService,
  ) {}

  // GET /api/seo-report/run  (Vercel Cron, wekelijks)
  @Get('run')
  async run(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!timingSafeBearer(auth, secret)) {
      this.logger.warn(
        'seo-report/run geweigerd: ontbrekende of onjuiste cron-secret.',
      );
      throw new UnauthorizedException();
    }
    return this.service.runAndSend();
  }
}
