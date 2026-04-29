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
  CampaignsService,
  type CampaignStatus,
  type CampaignType,
} from './campaigns.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.campaigns.findAll(restaurantId);
  }

  @Get(':id')
  findOne(@RestaurantId() restaurantId: string, @Param('id') id: string) {
    return this.campaigns.findById(restaurantId, id);
  }

  // Maakt een nieuwe campagne als 'concept'. Wordt aangeroepen vanaf
  // de Filly-chat zodra de eigenaar op "Ja, maak aan" klikt. Body:
  //   { name: string, type: 'mail'|'social'|'whatsapp',
  //     subject_line?: string, body: string }
  // RestaurantAccessGuard zorgt dat de user alleen mag schrijven naar
  // een restaurant waar hij toegang toe heeft.
  @Post()
  create(
    @RestaurantId() restaurantId: string,
    @Body()
    body: {
      name?: string;
      type?: string;
      subject_line?: string | null;
      body?: string;
    },
  ) {
    const name = body.name?.trim();
    const content = body.body?.trim();
    const type = body.type;

    if (!name) {
      throw new BadRequestException('Campagne-naam is verplicht.');
    }
    if (!content) {
      throw new BadRequestException('Campagne-inhoud is verplicht.');
    }
    if (type !== 'mail' && type !== 'social' && type !== 'whatsapp') {
      throw new BadRequestException(
        "Ongeldig campagnetype. Gebruik 'mail', 'social' of 'whatsapp'.",
      );
    }

    return this.campaigns.create(restaurantId, {
      name,
      type: type as CampaignType,
      subject_line: body.subject_line ?? null,
      body: content,
    });
  }

  // Update van een concept-campagne. Alleen naam, subject en body
  // zijn te bewerken via het dashboard-formulier; status-transitions
  // (concept → ingepland → actief) lopen via een apart endpoint
  // straks (nog niet geïmplementeerd; verzend-logica volgt).
  @Patch(':id')
  update(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      subject_line?: string | null;
      body?: string;
    },
  ) {
    return this.campaigns.update(restaurantId, id, body);
  }

  // Status-transitie endpoint. Aparte route i.p.v. status-veld in
  // de generieke PATCH zodat valideerbare lifecycle-logica niet stil
  // kan worden omzeild (bv. concept-edit die per ongeluk een status-
  // wijziging meestuurt).
  @Patch(':id/status')
  updateStatus(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    const status = body.status;
    if (
      status !== 'concept' &&
      status !== 'ingepland' &&
      status !== 'actief' &&
      status !== 'afgerond' &&
      status !== 'gearchiveerd'
    ) {
      throw new BadRequestException(
        'Ongeldige status. Gebruik concept, ingepland, actief, afgerond of gearchiveerd.',
      );
    }
    return this.campaigns.updateStatus(
      restaurantId,
      id,
      status as CampaignStatus,
    );
  }

  @Delete(':id')
  remove(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.remove(restaurantId, id);
  }

  // Lees gecachte filly-varianten + regen-count. Géén generatie.
  // Frontend gebruikt dit bij page-open om te bepalen of er al
  // varianten zijn (=> tonen) of dat een initial generate moet
  // (=> POST /refine).
  @Get(':id/variants')
  getVariants(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.getVariants(restaurantId, id);
  }

  // Genereert 3 alternatieven en cachet ze. Eerste call (count=0):
  // 3 varianten. Tweede call (count=1): 3 extra (totaal 6). Daarna
  // BadRequest voor kostenbeheersing.
  @Post(':id/refine')
  refine(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    return this.campaigns.refine(restaurantId, id, body.instruction);
  }

  // Upload een foto voor een concept-campagne (social of whatsapp).
  // Multipart-upload met 1 bestand. 10MB cap, JPG/PNG/WebP/GIF.
  // Vervangt eventueel oude foto in storage zodat we geen wezen
  // krijgen. Returnt het pad + 1-uur signed URL.
  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadMedia(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Geen bestand ontvangen. Selecteer een foto om te uploaden.',
      );
    }
    return this.campaigns.uploadMedia(restaurantId, id, {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
  }

  @Delete(':id/media')
  deleteMedia(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.deleteMedia(restaurantId, id);
  }
}
