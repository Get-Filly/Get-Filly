import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/current-user.decorator';
import { RestaurantAccessService } from '../common/restaurant-access.service';

/**
 * ============================================================
 * MeController, endpoints over de ingelogde user zelf
 * ============================================================
 *
 * Deze controller gaat NIET over één restaurant, maar over de user
 * en zijn relaties tot zijn restaurants. Daarom gebruiken we hier
 * alleen de AuthGuard, niet de RestaurantAccessGuard, de user hoeft
 * nog geen actief restaurant te hebben gekozen.
 *
 * Endpoints:
 *   GET /me/restaurants, lijst van restaurants waar de user toegang
 *                         toe heeft, met rol en permissies.
 *
 * De frontend gebruikt dit bij het inloggen om:
 *   - Het eerste (of eerder-gekozen) restaurant te activeren.
 *   - De switcher in het workspace-blok te tonen als er meerdere zijn.
 *   - Te weten wat de user mag (permissies → menu filteren).
 */
@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly access: RestaurantAccessService) {}

  @Get('restaurants')
  async getMyRestaurants(@CurrentUser() user: AuthenticatedUser) {
    // Haal alle koppelingen op + hun effectieve permissies.
    // De service filtert eventuele "wees"-koppelingen (waar het
    // restaurant inmiddels verwijderd is) er al uit.
    const list = await this.access.getUserRestaurants(user.id);

    // We geven alleen wat de frontend nodig heeft terug, geen
    // interne velden, geen stale data.
    return list.map((item) => ({
      id: item.restaurantId,
      name: item.restaurantName,
      role: item.role,
      permissions: item.permissions,
    }));
  }
}
