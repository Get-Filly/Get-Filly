import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

/**
 * KpiModule, dashboard-KPI's voor het actieve restaurant.
 *
 * Imports MeModule om RestaurantAccessService te krijgen (die de
 * tenant-check doet). Dat scheelt duplicatie als we later meer
 * modules hetzelfde patroon laten volgen.
 */
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [KpiController],
  providers: [KpiService, RestaurantAccessGuard],
})
export class KpiModule {}
