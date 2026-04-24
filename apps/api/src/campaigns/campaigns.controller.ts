import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CampaignsService,
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
}
