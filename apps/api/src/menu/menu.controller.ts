import { Controller, Get } from '@nestjs/common';
import { MenuService } from './menu.service';
import { RestaurantId } from '../common/restaurant-id.decorator';

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  findAll(@RestaurantId() restaurantId: string) {
    return this.menu.findAll(restaurantId);
  }
}
