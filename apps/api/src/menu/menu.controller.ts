import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MenuService,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
} from './menu.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// AuthGuard verifieert het Supabase-JWT; RestaurantAccessGuard zorgt dat
// de huidige gebruiker bij dit restaurant hoort. Beide guards op klasse-
// niveau zodat álle endpoints automatisch beschermd zijn — een nieuwe
// route per ongeluk vergeten beveiligen kán hier niet meer.
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.menu.findAll(restaurantId);
  }

  // Nieuw gerecht. Body wordt door MenuService gevalideerd; eventuele
  // BadRequestException krijgt een NL-tekst zodat de UI die direct kan
  // tonen aan de eigenaar.
  @Post()
  create(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateMenuItemInput,
  ) {
    return this.menu.create(restaurantId, body, user.id);
  }

  // Gerecht bewerken. PATCH (niet PUT) omdat we partial-updates
  // ondersteunen — de UI kan bv. alleen `is_available` toggelen
  // zonder de hele set velden mee te sturen.
  @Patch(':id')
  update(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateMenuItemInput,
  ) {
    return this.menu.update(restaurantId, id, body, user.id);
  }

  @Delete(':id')
  remove(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.menu.remove(restaurantId, id, user.id);
  }

  // ============================================================
  // Menukaart-import (Vision)
  // ============================================================

  // Upload een PDF/foto van de menukaart en laat Filly (Claude Vision)
  // de gerechten extraheren. Opslag + Vision-call + items wegschrijven
  // gebeuren synchroon — kan 5-15 seconden duren afhankelijk van menu-
  // grootte. Frontend toont een spinner met "Filly leest je menu…".
  //
  // Limieten: 12MB op multipart-niveau (slechts iets ruimer dan de 10MB
  // die MenuImporterService hanteert) zodat duidelijke 413-fouten ipv
  // generieke 500 bij grote files.
  @Post('import-card')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  importCard(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een PDF of foto van je menukaart.',
      );
    }
    return this.menu.importCard(
      restaurantId,
      user?.id ?? null,
      {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      'menu',
    );
  }

  // Drankkaart-upload: zelfde flow als import-card maar gebruikt het
  // drank-Vision-schema (subcategorie wijn-rood/bier/cocktail/etc) en
  // forceert server-side category='drank' op alle items.
  @Post('import-drinks-card')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  importDrinksCard(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een PDF of foto van je drankkaart.',
      );
    }
    return this.menu.importCard(
      restaurantId,
      user?.id ?? null,
      {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      'drinks',
    );
  }

  // Welke kaarten zijn nu actief? UI gebruikt dit om twee aparte
  // banners te tonen — één voor de menukaart en één voor de
  // drankkaart, met elk hun eigen "vervangen" / "verwijderen"-acties.
  @Get('active-cards')
  getActiveCards(@RestaurantId() restaurantId: string) {
    return this.menu.getActiveCards(restaurantId);
  }

  // Genereert een 1-uur signed URL voor het bron-bestand van een
  // upload zodat de UI 'm in een nieuw tabblad kan openen.
  @Get('cards/:uploadId/url')
  getCardUrl(
    @RestaurantId() restaurantId: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.menu.getCardSignedUrl(restaurantId, uploadId);
  }

  // Verwijder een menukaart (storage + db-rij + alle gekoppelde items).
  // Handmatig toegevoegde gerechten blijven staan — die zijn niet aan
  // deze kaart gekoppeld.
  @Delete('cards/:uploadId')
  removeCard(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
  ) {
    return this.menu.removeCard(restaurantId, uploadId, user.id);
  }
}
