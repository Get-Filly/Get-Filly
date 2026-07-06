import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import {
  GoogleBusinessService,
  type DayHours,
} from './google-business.service';

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

  // GET /api/integrations/google-business/profile
  // Haalt de beheerde GBP-accounts op (accounts.list) — bewijst dat de
  // business.manage-scope echt gebruikt wordt. 403 vóór API-goedkeuring.
  @Get('profile')
  async profile(@RestaurantId() restaurantId: string) {
    const accounts = await this.google.listAccounts(restaurantId);
    return { accounts };
  }

  // GET /api/integrations/google-business/locations
  // Locaties onder het beheerde account + hun huidige omschrijving.
  @Get('locations')
  async locations(@RestaurantId() restaurantId: string) {
    const locations = await this.google.listLocations(restaurantId);
    return { locations };
  }

  // PATCH /api/integrations/google-business/description
  // body { locationName, description } — schrijft de omschrijving naar Google
  // (de echte business.manage-write voor de verificatievideo).
  @Patch('description')
  @HttpCode(200)
  updateDescription(
    @RestaurantId() restaurantId: string,
    @Body() body: { locationName?: string; description?: string },
  ) {
    if (!body?.locationName || typeof body.description !== 'string') {
      throw new BadRequestException(
        'locationName en description zijn verplicht',
      );
    }
    return this.google.updateDescription(
      restaurantId,
      body.locationName,
      body.description,
    );
  }

  // PATCH /api/integrations/google-business/hours
  // body { locationName, days } — schrijft de weekopeningstijden naar Google.
  @Patch('hours')
  @HttpCode(200)
  updateHours(
    @RestaurantId() restaurantId: string,
    @Body()
    body: {
      locationName?: string;
      days?: Array<{
        day: string;
        open: boolean;
        openTime: string;
        closeTime: string;
      }>;
    },
  ) {
    if (!body?.locationName || !Array.isArray(body.days)) {
      throw new BadRequestException('locationName en days zijn verplicht');
    }
    return this.google.updateHours(
      restaurantId,
      body.locationName,
      body.days as DayHours[],
    );
  }

  // PATCH /api/integrations/google-business/special-days
  // body { locationName, closedDates } — zet sluitingsdata als specialHours.
  @Patch('special-days')
  @HttpCode(200)
  updateSpecialDays(
    @RestaurantId() restaurantId: string,
    @Body() body: { locationName?: string; closedDates?: string[] },
  ) {
    if (!body?.locationName || !Array.isArray(body.closedDates)) {
      throw new BadRequestException(
        'locationName en closedDates zijn verplicht',
      );
    }
    return this.google.updateSpecialDays(
      restaurantId,
      body.locationName,
      body.closedDates,
    );
  }

  // GET /api/integrations/google-business/reviews?locationName=locations/{id}
  @Get('reviews')
  reviews(
    @RestaurantId() restaurantId: string,
    @Query('locationName') locationName?: string,
  ) {
    if (!locationName) {
      throw new BadRequestException('locationName is verplicht');
    }
    return this.google.listReviews(restaurantId, locationName);
  }

  // POST /api/integrations/google-business/reviews/reply
  // body { reviewName, comment } — plaatst het antwoord van de zaak.
  @Post('reviews/reply')
  @HttpCode(200)
  replyToReview(
    @RestaurantId() restaurantId: string,
    @Body() body: { reviewName?: string; comment?: string },
  ) {
    if (!body?.reviewName || typeof body.comment !== 'string') {
      throw new BadRequestException('reviewName en comment zijn verplicht');
    }
    return this.google.replyToReview(
      restaurantId,
      body.reviewName,
      body.comment,
    );
  }

  // DELETE /api/integrations/google-business  (koppeling intrekken)
  @Delete()
  @HttpCode(200)
  disconnect(@RestaurantId() restaurantId: string) {
    return this.google.disconnect(restaurantId);
  }
}
