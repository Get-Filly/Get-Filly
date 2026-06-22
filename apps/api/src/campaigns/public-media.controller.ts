import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { CampaignsService } from './campaigns.service';

// ============================================================
// PublicMediaController — publieke campagne-video voor TikTok PULL_FROM_URL
// ============================================================
// BEWUST ZONDER AuthGuard/RestaurantAccessGuard: TikTok (en de web-route
// /media/c/:campaignId die ervoor proxyt) roept dit context-loos aan om de
// campagne-video op te halen. We geven alleen een KORTE signed URL terug
// voor de eerste video in de social-content van de campagne — geen andere
// campagne-data. Geen video → 404.
//
// De keten: TikTok → https://www.get-filly.com/media/c/:id (geverifieerd
// domein) → web-route streamt → GET /api/media/tiktok-video/:id (hier) →
// signed campaign-media-URL.
@Controller('media')
export class PublicMediaController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Public()
  @Get('tiktok-video/:campaignId')
  async tiktokVideo(
    @Param('campaignId') campaignId: string,
  ): Promise<{ url: string }> {
    const url = await this.campaigns.getTikTokVideoSignedUrl(campaignId);
    if (!url) {
      throw new NotFoundException('Geen video voor deze campagne.');
    }
    return { url };
  }
}
