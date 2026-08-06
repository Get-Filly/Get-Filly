import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { BusinessId } from '../common/business-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { TikTokService } from './tiktok.service';

// ============================================================
// TikTok-koppeling — ingelogde-user-endpoints
// ============================================================
// Business-gescoped (AuthGuard + BusinessAccessGuard). De web-callback
// roept /connect aan met de OAuth-code; de UI gebruikt /status en DELETE.
@Controller('integrations/tiktok')
@UseGuards(AuthGuard, BusinessAccessGuard)
export class TikTokController {
  constructor(private readonly tiktok: TikTokService) {}

  // POST /api/integrations/tiktok/connect   body { code, redirectUri }
  @Post('connect')
  @HttpCode(200)
  connect(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code?: string; redirectUri?: string },
  ) {
    if (!body?.code || !body?.redirectUri) {
      throw new BadRequestException('code en redirectUri zijn verplicht');
    }
    return this.tiktok.connect(
      businessId,
      user.id,
      body.code,
      body.redirectUri,
    );
  }

  // GET /api/integrations/tiktok/status
  @Get('status')
  status(@BusinessId() businessId: string) {
    return this.tiktok.status(businessId);
  }

  // GET /api/integrations/tiktok/creator-info
  // Creator-nickname/avatar + privacy-opties + max videoduur (compliance-UX).
  @Get('creator-info')
  creatorInfo(@BusinessId() businessId: string) {
    return this.tiktok.queryCreatorInfo(businessId);
  }

  // POST /api/integrations/tiktok/upload
  // body { videoUrl, title?, privacyLevel, brandOrganic?, brandedContent?,
  //        disableComment?, disableDuet?, disableStitch? }
  // Direct Post: post de video direct op het TikTok-account.
  @Post('upload')
  @HttpCode(200)
  upload(
    @BusinessId() businessId: string,
    @Body()
    body: {
      videoUrl?: string;
      title?: string;
      privacyLevel?: string;
      brandOrganic?: boolean;
      brandedContent?: boolean;
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
    },
  ) {
    if (!body?.videoUrl || !body.videoUrl.trim()) {
      throw new BadRequestException('videoUrl is verplicht');
    }
    if (!body?.privacyLevel) {
      throw new BadRequestException('privacyLevel is verplicht');
    }
    return this.tiktok.directPost(businessId, {
      videoUrl: body.videoUrl,
      title: body.title,
      privacyLevel: body.privacyLevel,
      brandOrganic: body.brandOrganic,
      brandedContent: body.brandedContent,
      disableComment: body.disableComment,
      disableDuet: body.disableDuet,
      disableStitch: body.disableStitch,
    });
  }

  // DELETE /api/integrations/tiktok   (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@BusinessId() businessId: string) {
    return this.tiktok.disconnect(businessId);
  }
}
