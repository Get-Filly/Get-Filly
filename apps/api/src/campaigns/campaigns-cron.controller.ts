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
import { CampaignsService } from './campaigns.service';

// ============================================================
// Campagne-cron — ingeplande social-campagnes publiceren (PUBLIEK)
// ============================================================
// Geen AuthGuard/RestaurantAccessGuard: dit wordt door Vercel Cron
// aangeroepen, niet door een ingelogde user (zelfde patroon als
// seo-report/run). Vercel zet bij cron-aanroepen automatisch
// `Authorization: Bearer <CRON_SECRET>`; zonder geldige secret → 401.
//
// Aparte base-path `campaigns/cron` zodat 'ie NIET botst met de
// guarded CampaignsController (`@Get(':id')` matcht maar één segment).
//
// Timing: deze cron polt elk half uur (Vercel Pro, zie vercel.json) en
// publiceert alles waarvan `scheduled_for <= now`. Een ingeplande campagne
// gaat dus binnen ~30 min na z'n geplande tijd live. Direct publiceren loopt
// NIET via deze cron maar synchroon via "Activeer nu". NB: alleen
// type='social' — ingeplande mail wordt (nog) niet automatisch verstuurd.
// @Public(): globale AuthGuard slaat 'm over; beveiliging = de CRON_SECRET-check.
@Public()
@Controller('campaigns/cron')
export class CampaignsCronController {
  private readonly logger = new Logger(CampaignsCronController.name);

  constructor(
    private readonly campaigns: CampaignsService,
    private readonly config: ConfigService,
  ) {}

  // GET /api/campaigns/cron/run-scheduled  (Vercel Cron)
  @Get('run-scheduled')
  async runScheduled(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!timingSafeBearer(auth, secret)) {
      this.logger.warn(
        'campaigns/cron/run-scheduled geweigerd: ontbrekende of onjuiste cron-secret.',
      );
      throw new UnauthorizedException();
    }
    const result = await this.campaigns.runScheduledSocial();
    this.logger.log(
      `Cron-publiceren klaar: ${JSON.stringify(result)}`,
    );
    return result;
  }
}
