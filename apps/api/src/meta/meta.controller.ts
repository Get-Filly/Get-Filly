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
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { MetaService } from './meta.service';

// ============================================================
// Meta (Facebook/Instagram) koppeling — ingelogde-user-endpoints
// ============================================================
// Restaurant-gescoped: AuthGuard (geldige JWT) + RestaurantAccessGuard
// (X-Restaurant-Id + toegangscheck). De web-callback roept /connect
// aan met de OAuth-code; de UI gebruikt /status en DELETE.
@Controller('integrations/meta')
@UseGuards(AuthGuard, RestaurantAccessGuard)
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  // POST /api/integrations/meta/connect   body { code, redirectUri }
  @Post('connect')
  @HttpCode(200)
  connect(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code?: string; redirectUri?: string },
  ) {
    if (!body?.code || !body?.redirectUri) {
      throw new BadRequestException('code en redirectUri zijn verplicht');
    }
    return this.meta.connect(
      restaurantId,
      user.id,
      body.code,
      body.redirectUri,
    );
  }

  // GET /api/integrations/meta/status
  @Get('status')
  status(@RestaurantId() restaurantId: string) {
    return this.meta.status(restaurantId);
  }

  // GET /api/integrations/meta/pages  → lijst FB-pagina's
  @Get('pages')
  pages(@RestaurantId() restaurantId: string) {
    return this.meta.listPages(restaurantId);
  }

  // POST /api/integrations/meta/select-page   body { pageId }
  @Post('select-page')
  @HttpCode(200)
  selectPage(
    @RestaurantId() restaurantId: string,
    @Body() body: { pageId?: string },
  ) {
    if (!body?.pageId) {
      throw new BadRequestException('pageId is verplicht');
    }
    return this.meta.selectPage(restaurantId, body.pageId);
  }

  // POST /api/integrations/meta/publish
  // body { message, imageUrl?, toFacebook?, toInstagram? }
  @Post('publish')
  @HttpCode(200)
  publish(
    @RestaurantId() restaurantId: string,
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
    return this.meta.publish(restaurantId, {
      message: body.message,
      imageUrl: body.imageUrl,
      toFacebook: body.toFacebook ?? true,
      toInstagram: body.toInstagram ?? false,
    });
  }

  // DELETE /api/integrations/meta   (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@RestaurantId() restaurantId: string) {
    return this.meta.disconnect(restaurantId);
  }
}
