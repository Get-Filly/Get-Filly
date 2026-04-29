import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RestaurantService } from './restaurant.service';
import { DataExportService } from './data-export.service';
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
  ) {}

  @Get('me')
  getMe(@RestaurantId() restaurantId: string) {
    return this.restaurant.getById(restaurantId);
  }

  @Patch('me')
  updateMe(
    @RestaurantId() restaurantId: string,
    @Body() updates: Record<string, unknown>,
  ) {
    return this.restaurant.update(restaurantId, updates);
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
}
