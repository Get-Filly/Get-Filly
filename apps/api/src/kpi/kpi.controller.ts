import { Controller, Get, UseGuards } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';

/**
 * KpiController — dashboard-KPI's voor het ingelogde restaurant.
 *
 * TESTCASE voor de nieuwe AuthGuard:
 *   Dit is het EERSTE endpoint dat we onder de guard zetten. Zo testen
 *   we de end-to-end flow zonder de rest van de app te raken.
 *
 *   Wat er nu gebeurt bij een request naar GET /kpi:
 *     1. AuthGuard fires → leest Authorization: Bearer <jwt>
 *     2. Verifieert JWT met SUPABASE_JWT_SECRET
 *     3. Zet user op req.user
 *     4. Als ALLES klopt: controller-methode draait
 *     5. Anders: 401 Unauthorized
 *
 *   @RestaurantId() werkt nog met de oude fallback naar demo-id. Die
 *   breiden we in de volgende stap uit met tenant-verificatie.
 */
@UseGuards(AuthGuard)
@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  getKpis(@RestaurantId() restaurantId: string) {
    return this.kpi.getKpis(restaurantId);
  }
}
