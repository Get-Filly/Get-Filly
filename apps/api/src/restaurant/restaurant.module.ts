import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { DataExportService } from './data-export.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// GeocodingModule levert de PDOK-call voor adres → lat/long; wordt
// automatisch getriggerd zodra adres/postcode/stad wordt bijgewerkt.
// AiModule levert WebsiteAnalyzerService voor de "Analyseer website"-knop.
// AuditLogModule voor het loggen van mutaties (compliance + debugging).
@Module({
  imports: [
    SupabaseModule,
    MeModule,
    GeocodingModule,
    AiModule,
    AuditLogModule,
  ],
  controllers: [RestaurantController],
  providers: [
    RestaurantService,
    DataExportService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
})
export class RestaurantModule {}
