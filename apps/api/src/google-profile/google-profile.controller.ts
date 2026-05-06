import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GoogleProfileService } from './google-profile.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

/**
 * ============================================================
 * GoogleProfileController, REST-endpoints voor de GBP-hub
 * ============================================================
 *
 * Endpoints (allemaal beschermd door AuthGuard + RestaurantAccessGuard):
 *
 *   POST   /google-profile/search         , text-search (onboarding-detect)
 *   GET    /google-profile/me             , gecachete profile-data
 *   POST   /google-profile/me/connect     , koppel een place_id
 *   POST   /google-profile/me/refresh     , force-refresh cache
 *   DELETE /google-profile/me             , ontkoppel (place_id wissen)
 *   GET    /google-profile/me/competitors , buurt-vergelijking (?radius=1000)
 *
 * Alle endpoints retourneren JSON met de PlaceDetails-shape uit
 * `types.ts`. Front-end kan deze direct in de hub-pagina renderen.
 * ============================================================
 */
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('google-profile')
export class GoogleProfileController {
  constructor(private readonly service: GoogleProfileService) {}

  // POST omdat de body een vrije query-string kan bevatten en omdat
  // we mogelijk later locatie-bias willen meegeven (lat/lng coords).
  // GET met query-string zou ook kunnen, maar POST is consistenter
  // met de andere search-endpoints in onze codebase.
  @Post('search')
  search(@Body() body: { query: string; lat?: number; lng?: number }) {
    if (!body || typeof body.query !== 'string') {
      throw new BadRequestException('Body moet een `query` (string) bevatten.');
    }
    const bias =
      typeof body.lat === 'number' && typeof body.lng === 'number'
        ? { lat: body.lat, lng: body.lng }
        : undefined;
    return this.service.searchByText(body.query, bias);
  }

  @Get('me')
  getMine(@RestaurantId() restaurantId: string) {
    return this.service.getMine(restaurantId);
  }

  @Post('me/connect')
  connect(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { placeId: string },
  ) {
    if (!body?.placeId || typeof body.placeId !== 'string') {
      throw new BadRequestException('Body moet een `placeId` (string) bevatten.');
    }
    return this.service.connect(restaurantId, user.id, body.placeId);
  }

  @Post('me/refresh')
  refresh(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.refresh(restaurantId, user.id);
  }

  @Get('me/audit')
  getAudit(@RestaurantId() restaurantId: string) {
    return this.service.getAudit(restaurantId);
  }

  // ?radius=1000 (in meter). Default 1km, past bij stadsbuurten;
  // voor grotere steden kan de eigenaar straks 2km/3km kiezen via UI.
  @Get('me/competitors')
  getCompetitors(
    @RestaurantId() restaurantId: string,
    @Query('radius') radiusRaw?: string,
  ) {
    const radius = radiusRaw ? parseInt(radiusRaw, 10) : 1000;
    if (!Number.isFinite(radius)) {
      throw new BadRequestException('`radius` moet een getal in meters zijn.');
    }
    return this.service.getCompetitors(restaurantId, radius);
  }

  // DELETE om de koppeling weer los te maken. Wist place_id +
  // gecachete data + sync-timestamp. Niet hetzelfde als account-delete
  // (dat zit in AccountDeletionService).
  @Delete('me')
  disconnect(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.disconnect(restaurantId, user.id);
  }
}
