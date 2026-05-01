import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuSuggestionsService } from './menu-suggestions.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

// AuthGuard verifieert het JWT; RestaurantAccessGuard zorgt dat de
// user bij dit restaurant hoort. Beide op klasse-niveau zodat álle
// endpoints automatisch beschermd zijn.
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('menu-suggestions')
export class MenuSuggestionsController {
  constructor(private readonly service: MenuSuggestionsService) {}

  // Lijst van voorstellen. Default status='pending' voor de
  // "Voorgesteld"-tab; status='rejected' voor de "Afgewezen"-tab.
  // Lazy expire-cleanup van pending gebeurt in de service.
  @Get()
  list(
    @RestaurantId() restaurantId: string,
    @Query('status') status?: string,
  ) {
    if (status && status !== 'pending' && status !== 'rejected') {
      throw new BadRequestException(
        "Ongeldige status. Gebruik 'pending' of 'rejected'.",
      );
    }
    return this.service.list(restaurantId, status as 'pending' | 'rejected' | undefined);
  }

  // "✨ Vraag Filly om gerecht-voorstellen". AiRateLimitGuard staat
  // alleen voor de generate + refine endpoints — list/accept/reject
  // doen geen AI-calls dus die hoeven niet rate-limited.
  @Post('generate')
  @UseGuards(AiRateLimitGuard)
  generate(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.generate(restaurantId, user.id);
  }

  // 1-klik accept: voorstel → echt menu_item.
  @Post(':id/accept')
  accept(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.accept(restaurantId, id, user.id);
  }

  // Reject = status='rejected'. Niet hard-deleten zodat we later
  // kunnen leren welke voorstellen werden afgewezen (signal voor
  // prompt-tuning).
  @Delete(':id')
  reject(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.reject(restaurantId, id, user.id);
  }

  // "Andere variant"-knop. Genereert nieuwe pending-rij; oude wordt
  // op refined_into gezet. Cap van 3 refines per origineel.
  @Post(':id/refine')
  @UseGuards(AiRateLimitGuard)
  refine(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.refine(restaurantId, id, user.id);
  }
}
