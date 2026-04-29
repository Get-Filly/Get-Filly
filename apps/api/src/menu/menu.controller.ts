import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  MenuService,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
} from './menu.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
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
    @Body() body: CreateMenuItemInput,
  ) {
    return this.menu.create(restaurantId, body);
  }

  // Gerecht bewerken. PATCH (niet PUT) omdat we partial-updates
  // ondersteunen — de UI kan bv. alleen `is_available` toggelen
  // zonder de hele set velden mee te sturen.
  @Patch(':id')
  update(
    @RestaurantId() restaurantId: string,
    @Param('id') id: string,
    @Body() body: UpdateMenuItemInput,
  ) {
    return this.menu.update(restaurantId, id, body);
  }

  @Delete(':id')
  remove(@RestaurantId() restaurantId: string, @Param('id') id: string) {
    return this.menu.remove(restaurantId, id);
  }
}
