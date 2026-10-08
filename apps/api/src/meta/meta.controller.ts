import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { BusinessId } from '../common/business-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { MetaService } from './meta.service';

// ============================================================
// Meta (Facebook/Instagram) koppeling — ingelogde-user-endpoints
// ============================================================
// Business-gescoped: AuthGuard (geldige JWT) + BusinessAccessGuard
// (X-Business-Id + toegangscheck). De web-callback roept /connect
// aan met de OAuth-code; de UI gebruikt /status en DELETE.
@Controller('integrations/meta')
@UseGuards(AuthGuard, BusinessAccessGuard)
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  // POST /api/integrations/meta/connect   body { code, redirectUri }
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
    return this.meta.connect(
      businessId,
      user.id,
      body.code,
      body.redirectUri,
    );
  }

  // GET /api/integrations/meta/status
  @Get('status')
  status(@BusinessId() businessId: string) {
    return this.meta.status(businessId);
  }

  // GET /api/integrations/meta/pages  → lijst FB-pagina's
  @Get('pages')
  pages(@BusinessId() businessId: string) {
    return this.meta.listPages(businessId);
  }

  // GET /api/integrations/meta/insights  → live social-engagement
  @Get('insights')
  insights(@BusinessId() businessId: string) {
    return this.meta.getInsights(businessId);
  }

  // POST /api/integrations/meta/select-page   body { pageId }
  @Post('select-page')
  @HttpCode(200)
  selectPage(
    @BusinessId() businessId: string,
    @Body() body: { pageId?: string },
  ) {
    if (!body?.pageId) {
      throw new BadRequestException('pageId is verplicht');
    }
    return this.meta.selectPage(businessId, body.pageId);
  }

  // POST /api/integrations/meta/publish
  // body { message, imageUrl?, toFacebook?, toInstagram? }
  @Post('publish')
  @HttpCode(200)
  publish(
    @BusinessId() businessId: string,
    @Body()
    body: {
      message?: string;
      imageUrl?: string;
      toFacebook?: boolean;
      toInstagram?: boolean;
    },
  ) {
    if (!body?.message || !body.message.trim()) {
      throw new BadRequestException('message is verplicht');
    }
    return this.meta.publish(businessId, {
      message: body.message,
      imageUrl: body.imageUrl,
      toFacebook: body.toFacebook ?? true,
      toInstagram: body.toInstagram ?? false,
    });
  }

  // POST /api/integrations/meta/story-image   multipart { file }
  // Het story-beeld (9:16 JPEG, tekst erin gerenderd) → publieke URL.
  @Post('story-image')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 9 * 1024 * 1024 } }),
  )
  storyImage(
    @BusinessId() businessId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Geen beeld ontvangen');
    return this.meta.uploadStoryImage(businessId, {
      buffer: file.buffer,
      mimeType: file.mimetype,
    });
  }

  // POST /api/integrations/meta/story
  // body { imageUrl, toFacebook?, toInstagram? }
  @Post('story')
  @HttpCode(200)
  story(
    @BusinessId() businessId: string,
    @Body()
    body: { imageUrl?: string; toFacebook?: boolean; toInstagram?: boolean },
  ) {
    if (!body?.imageUrl) {
      throw new BadRequestException('imageUrl is verplicht');
    }
    return this.meta.publishStory(businessId, {
      imageUrl: body.imageUrl,
      toFacebook: body.toFacebook ?? true,
      toInstagram: body.toInstagram ?? true,
    });
  }

  // DELETE /api/integrations/meta   (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@BusinessId() businessId: string) {
    return this.meta.disconnect(businessId);
  }
}
