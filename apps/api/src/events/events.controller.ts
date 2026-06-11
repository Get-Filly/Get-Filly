import {
  Controller,
  Get,
  Headers,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsSyncService } from './events-sync.service';

// Cron-endpoint voor de wekelijkse evenementen.nl-sync. Zelfde
// beveiligings-patroon als seo-report/run: Vercel Cron stuurt
// `Authorization: Bearer <CRON_SECRET>` mee wanneer CRON_SECRET in
// de project-env staat; zonder geldige secret → 401.
@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly sync: EventsSyncService,
  ) {}

  // GET /api/events/sync  (Vercel Cron, wekelijks di 04:00 UTC)
  @Get('sync')
  async runSync(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || auth !== `Bearer ${secret}`) {
      this.logger.warn(
        'events/sync geweigerd: ontbrekende of onjuiste cron-secret.',
      );
      throw new UnauthorizedException();
    }
    return this.sync.runSync();
  }
}
