import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
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
}
