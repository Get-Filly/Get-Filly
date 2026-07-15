import {
  Controller,
  Get,
  Headers,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeBearer } from '../common/cron-secret';
import { Public } from '../common/public.decorator';
import { BusynessService } from './busyness.service';

// ============================================================
// Busyness-cron — wekelijks het drukte-patroon ophalen (PUBLIEK)
// ============================================================
// Haalt per restaurant (met google_place_id) Google's populaire tijden op
// via Outscraper en schrijft een busyness_snapshots-rij. Zelfde
// beveiligings-patroon als de andere crons: Vercel Cron stuurt
// `Authorization: Bearer <CRON_SECRET>` mee; zonder geldige secret → 401.
// @Public(): globale AuthGuard slaat 'm over; beveiliging = de secret-check.
@Public()
@Controller('busyness/cron')
export class BusynessCronController {
  private readonly logger = new Logger(BusynessCronController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly busyness: BusynessService,
  ) {}

  // GET /api/busyness/cron/refresh  (Vercel Cron, wekelijks ma 04:00 UTC)
  @Get('refresh')
  async refresh(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!timingSafeBearer(auth, secret)) {
      this.logger.warn(
        'busyness/cron/refresh geweigerd: ontbrekende of onjuiste cron-secret.',
      );
      throw new UnauthorizedException();
    }
    return this.busyness.refreshAll();
  }
}
