import { Controller, Get, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.menu.findAll(restaurantId);
  }
}
