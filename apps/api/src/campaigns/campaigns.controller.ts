import { Controller, Get } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.campaigns.findAll(restaurantId);
  }
}
