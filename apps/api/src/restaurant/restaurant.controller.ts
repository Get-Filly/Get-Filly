import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('restaurant')
export class RestaurantController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get('me')
  getMe(@RestaurantId() restaurantId: string) {
    return this.restaurant.getById(restaurantId);
  }

  @Patch('me')
  updateMe(
    @RestaurantId() restaurantId: string,
    @Body() updates: Record<string, unknown>,
  ) {
    return this.restaurant.update(restaurantId, updates);
  }

  // "Analyseer website"-knop op de account-pagina. Eigenaar slaat
  // eerst de website-URL op via PATCH /me, en triggert vervolgens
  // expliciet de analyse via deze POST. Bewust handmatig (niet
  // automatisch op PATCH) zodat de Claude-call alleen draait wanneer
  // de eigenaar het wil — voorkomt verrassings-kosten bij elke save.
  @Post('me/analyze-website')
  analyzeWebsite(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.restaurant.analyzeWebsite(restaurantId, user.id);
  }
}
