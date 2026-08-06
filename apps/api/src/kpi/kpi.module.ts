import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { BusinessAccessGuard } from '../common/business-access.guard';

/**
 * KpiModule, dashboard-KPI's voor het actieve restaurant.
 *
 * Imports MeModule om BusinessAccessService te krijgen (die de
 * tenant-check doet). Dat scheelt duplicatie als we later meer
 * modules hetzelfde patroon laten volgen.
 */
@Module({
  imports: [SupabaseModule, MeModule],
  controllers: [KpiController],
  providers: [KpiService, BusinessAccessGuard],
})
export class KpiModule {}
