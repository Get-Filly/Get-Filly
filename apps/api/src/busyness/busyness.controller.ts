import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { BusynessService } from './busyness.service';

// ============================================================
// Busyness-controller — handmatige trigger (getest via de app)
// ============================================================
// Zo kan de eigenaar (of wij, tijdens ontwikkeling) direct een pull
// forceren voor het actieve restaurant zonder op de wekelijkse cron te
// wachten. De guard regelt dat je alleen je eigen restaurant kunt
// verversen; de service schrijft via de service-role weg.
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('busyness')
export class BusynessController {
  constructor(private readonly busyness: BusynessService) {}

  // POST /api/busyness/me/refresh
  @Post('me/refresh')
  refresh(@RestaurantId() restaurantId: string) {
    return this.busyness.refreshRestaurant(restaurantId);
  }

  // GET /api/busyness/me — laatste weekpatroon + live voor het dashboard.
  @Get('me')
  getMine(@RestaurantId() restaurantId: string) {
    return this.busyness.getLatest(restaurantId);
  }

  // GET /api/busyness/me/actual?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Echte werkelijk-drukte per dag (uit live-metingen) voor de grafiek.
  @Get('me/actual')
  getActual(
    @RestaurantId() restaurantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.busyness.getActualByDate(restaurantId, from, to);
  }
}
