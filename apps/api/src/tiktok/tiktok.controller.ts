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
import { TikTokService } from './tiktok.service';

// ============================================================
// TikTok-koppeling — ingelogde-user-endpoints
// ============================================================
// Restaurant-gescoped (AuthGuard + RestaurantAccessGuard). De web-callback
// roept /connect aan met de OAuth-code; de UI gebruikt /status en DELETE.
@Controller('integrations/tiktok')
@UseGuards(AuthGuard, RestaurantAccessGuard)
export class TikTokController {
  constructor(private readonly tiktok: TikTokService) {}

  // POST /api/integrations/tiktok/connect   body { code, redirectUri }
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
    return this.tiktok.connect(
      restaurantId,
      user.id,
      body.code,
      body.redirectUri,
    );
  }

  // GET /api/integrations/tiktok/status
  @Get('status')
  status(@RestaurantId() restaurantId: string) {
    return this.tiktok.status(restaurantId);
  }

  // DELETE /api/integrations/tiktok   (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@RestaurantId() restaurantId: string) {
    return this.tiktok.disconnect(restaurantId);
  }
}
