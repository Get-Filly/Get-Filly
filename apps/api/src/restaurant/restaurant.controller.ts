import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RestaurantService } from './restaurant.service';
import { DataExportService } from './data-export.service';
import { AccountDeletionService } from './account-deletion.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('restaurant')
export class RestaurantController {
  constructor(
    private readonly restaurant: RestaurantService,
    private readonly dataExport: DataExportService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  @Get('me')
  getMe(@RestaurantId() restaurantId: string) {
    return this.restaurant.getById(restaurantId);
  }

  @Patch('me')
  updateMe(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() updates: Record<string, unknown>,
  ) {
    // userId doorreiken naar de service zodat de audit-log weet wié
    // de wijziging deed (niet alleen wélk restaurant). Vereist voor
    // klant-support: bij een team van 5 weet je anders niet wie
    // bedrijfsgegevens of branding heeft aangepast.
    return this.restaurant.update(restaurantId, updates, user.id);
  }

  // "Analyseer website"-knop op de account-pagina. Eigenaar slaat
  // eerst de website-URL op via PATCH /me, en triggert vervolgens
  // expliciet de analyse via deze POST. Bewust handmatig (niet
  // automatisch op PATCH) zodat de Claude-call alleen draait wanneer
  // de eigenaar het wil — voorkomt verrassings-kosten bij elke save.
  @Post('me/analyze-website')
  analyzeWebsite(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.restaurant.analyzeWebsite(restaurantId, user.id);
  }

  // AVG art. 20 — recht op gegevensoverdraagbaarheid. Eigenaar kan
  // alle business-data van zijn restaurant downloaden als één JSON-
  // bestand. Bevat profielen, gasten, reserveringen, menu, campagnes,
  // reviews, chat-history en audit-log. Geen storage-binaries (logo's
  // etc) — die kan eigenaar zelf via de URLs in de export ophalen.
  @Get('me/export')
  async exportData(
    @RestaurantId() restaurantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.dataExport.exportRestaurantData(restaurantId);
    // Content-Disposition zodat de browser direct een download
    // suggesteert i.p.v. de JSON in de tab te tonen. Filename met
    // datum zodat je oudere exports kunt onderscheiden.
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="getfilly-export-${date}.json"`,
    );
    return result;
  }

  // AVG art. 17 — recht op vergetelheid. Verwijdert permanent:
  //   - Alle restaurants waar de ingelogde user 'owner' is, incl.
  //     gasten, reserveringen, menu, campagnes, reviews, chat,
  //     audit-log (cascade via FK on delete cascade)
  //   - De user zelf (auth.users + public.users + restaurant_users)
  //
  // Vóór delete worden afgeronde campagnes geanonimiseerd weggeschreven
  // naar `campaign_benchmarks` zodat Filly's leer-loop niet lijdt
  // onder verwijderingen — geen restaurant_id, geen body-tekst, geen
  // PII (Recital 26 GDPR).
  //
  // Body: { confirmation: "VERWIJDER" }. Check is letterlijk —
  // voorkomt accidentele DELETE-requests vanuit ander UI of API-test.
  @Delete('me/account')
  deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { confirmation?: string },
  ) {
    return this.accountDeletion.deleteAccount(user.id, body?.confirmation ?? '');
  }
}
