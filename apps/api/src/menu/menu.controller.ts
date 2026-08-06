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
import { BusinessId } from '../common/business-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

// AuthGuard verifieert het Supabase-JWT; BusinessAccessGuard zorgt dat
// de huidige gebruiker bij dit restaurant hoort. Beide guards op klasse-
// niveau zodat álle endpoints automatisch beschermd zijn, een nieuwe
// route per ongeluk vergeten beveiligen kán hier niet meer.
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  findAll(@BusinessId() businessId: string) {
    return this.menu.findAll(businessId);
  }

  // Nieuw gerecht. Body wordt door MenuService gevalideerd; eventuele
  // BadRequestException krijgt een NL-tekst zodat de UI die direct kan
  // tonen aan de eigenaar.
  @Post()
  create(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateMenuItemInput,
  ) {
    return this.menu.create(businessId, body, user.id);
  }

  // Gerecht bewerken. PATCH (niet PUT) omdat we partial-updates
  // ondersteunen, de UI kan bv. alleen `is_available` toggelen
  // zonder de hele set velden mee te sturen.
  @Patch(':id')
  update(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateMenuItemInput,
  ) {
    return this.menu.update(businessId, id, body, user.id);
  }

  @Delete(':id')
  remove(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.menu.remove(businessId, id, user.id);
  }

  // ============================================================
  // Menukaart-import (Vision)
  // ============================================================

  // Upload een PDF/foto van de menukaart en laat Filly (Claude Vision)
  // de gerechten extraheren. Opslag + Vision-call + items wegschrijven
  // gebeuren synchroon, kan 5-15 seconden duren afhankelijk van menu-
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
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een PDF of foto van je menukaart.',
      );
    }
    return this.menu.importCard(
      businessId,
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
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een PDF of foto van je drankkaart.',
      );
    }
    return this.menu.importCard(
      businessId,
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
  // banners te tonen, één voor de menukaart en één voor de
  // drankkaart, met elk hun eigen "vervangen" / "verwijderen"-acties.
  @Get('active-cards')
  getActiveCards(@BusinessId() businessId: string) {
    return this.menu.getActiveCards(businessId);
  }

  // Genereert een 1-uur signed URL voor het bron-bestand van een
  // upload zodat de UI 'm in een nieuw tabblad kan openen.
  @Get('cards/:uploadId/url')
  getCardUrl(
    @BusinessId() businessId: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.menu.getCardSignedUrl(businessId, uploadId);
  }

  // Verwijder een menukaart (storage + db-rij + alle gekoppelde items).
  // Handmatig toegevoegde gerechten blijven staan, die zijn niet aan
  // deze kaart gekoppeld.
  @Delete('cards/:uploadId')
  removeCard(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
  ) {
    return this.menu.removeCard(businessId, uploadId, user.id);
  }
}
