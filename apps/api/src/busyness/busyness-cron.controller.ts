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
  // Ververst álle zaken (ongeacht open/dicht). Vangnet naast de live-cron.
  @Get('refresh')
  async refresh(@Headers('authorization') auth?: string) {
    if (!this.authorized(auth)) throw new UnauthorizedException();
    return this.busyness.refreshAll();
  }

  // GET /api/busyness/cron/live  (Vercel Cron, elk uur)
  // Belt alleen zaken die NU open zijn → live-meting + pattern-refresh.
  @Get('live')
  async live(@Headers('authorization') auth?: string) {
    if (!this.authorized(auth)) throw new UnauthorizedException();
    return this.busyness.refreshLive();
  }

  private authorized(auth?: string): boolean {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!timingSafeBearer(auth, secret)) {
      this.logger.warn('busyness/cron geweigerd: onjuiste cron-secret.');
      return false;
    }
    return true;
  }
}
