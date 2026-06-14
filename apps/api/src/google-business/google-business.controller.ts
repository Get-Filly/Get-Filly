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
import { GoogleBusinessService } from './google-business.service';

// ============================================================
// Google Bedrijfsprofiel koppeling — ingelogde-user-endpoints
// ============================================================
// Restaurant-gescoped: AuthGuard (geldige JWT) + RestaurantAccessGuard
// (X-Restaurant-Id + toegangscheck). De web-callback roept /connect aan
// met de OAuth-code; de UI gebruikt /status en DELETE.
@Controller('integrations/google-business')
@UseGuards(AuthGuard, RestaurantAccessGuard)
export class GoogleBusinessController {
  constructor(private readonly google: GoogleBusinessService) {}

  // POST /api/integrations/google-business/connect  body { code, redirectUri }
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
    return this.google.connect(
      restaurantId,
      user.id,
      body.code,
      body.redirectUri,
    );
  }

  // GET /api/integrations/google-business/status
  @Get('status')
  status(@RestaurantId() restaurantId: string) {
    return this.google.status(restaurantId);
  }

  // DELETE /api/integrations/google-business  (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@RestaurantId() restaurantId: string) {
    return this.google.disconnect(restaurantId);
  }
}
