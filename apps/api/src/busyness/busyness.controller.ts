import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { BusynessService } from './busyness.service';

// ============================================================
// Busyness-controller — handmatige trigger (getest via de app)
// ============================================================
// Zo kan de eigenaar (of wij, tijdens ontwikkeling) direct een pull
// forceren voor het actieve restaurant zonder op de wekelijkse cron te
// wachten. De guard regelt dat je alleen je eigen restaurant kunt
// verversen; de service schrijft via de service-role weg.
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('busyness')
export class BusynessController {
  constructor(private readonly busyness: BusynessService) {}

  // POST /api/busyness/me/refresh
  @Post('me/refresh')
  refresh(@BusinessId() businessId: string) {
    return this.busyness.refreshRestaurant(businessId);
  }

  // GET /api/busyness/me — laatste weekpatroon + live voor het dashboard.
  @Get('me')
  getMine(@BusinessId() businessId: string) {
    return this.busyness.getLatest(businessId);
  }

  // GET /api/busyness/me/actual?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Echte werkelijk-drukte per dag (uit live-metingen) voor de grafiek.
  @Get('me/actual')
  getActual(
    @BusinessId() businessId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.busyness.getActualByDate(businessId, from, to);
  }

  // GET /api/busyness/me/quiet-moments?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Rustige momenten (dag + dagdeel), voorspellend. Zelfde bron als de auto-
  // detectie; voedt de dashboard-markers + de chat-blokjes (één bron). Zonder
  // from/to: vandaag t/m +14 dagen.
  @Get('me/quiet-moments')
  getQuiet(
    @BusinessId() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const start = from ?? iso(today);
    let end = to;
    if (!end) {
      const e = new Date(today);
      e.setDate(e.getDate() + 14);
      end = iso(e);
    }
    return this.busyness.getQuietMoments(businessId, start, end);
  }
}
