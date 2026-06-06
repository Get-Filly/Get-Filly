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

  // DELETE /api/integrations/meta   (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@RestaurantId() restaurantId: string) {
    return this.meta.disconnect(restaurantId);
  }
}
