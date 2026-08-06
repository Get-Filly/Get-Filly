import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BusinessMediaService } from './business-media.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// AuthGuard verifieert het JWT, BusinessAccessGuard zorgt dat de
// user bij dit restaurant hoort. Beide op klasse-niveau zodat álle
// endpoints automatisch beschermd zijn.
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('business-media')
export class BusinessMediaController {
  constructor(private readonly service: BusinessMediaService) {}

  // Lijst van alle foto's incl. signed URLs. Wordt gebruikt door de
  // foto-bibliotheek-sectie op de account-pagina én door de
  // "Kies uit bibliotheek"-modal op de campagne-pagina.
  @Get()
  list(@BusinessId() businessId: string) {
    return this.service.list(businessId);
  }

  // Single-file upload. Multipart-limit ruim boven de service-cap
  // (5MB) zodat we duidelijke 413-fouten krijgen bij te grote files
  // in plaats van een ondergrond-Multer-error.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // 55MB: net boven de service-cap (50MB video / 5MB foto) zodat de
      // nette NL-foutmelding van de service leidend is, niet Multer's ruwe.
      limits: { fileSize: 55 * 1024 * 1024 },
    }),
  )
  upload(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een foto.',
      );
    }
    return this.service.upload(businessId, user.id, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Delete(':id')
  remove(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.remove(businessId, id, user.id);
  }
}
