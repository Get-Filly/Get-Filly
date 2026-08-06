import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { DataExportService } from './data-export.service';
import { AccountDeletionService } from './account-deletion.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AnonymizationModule } from '../anonymization/anonymization.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

// GeocodingModule levert de PDOK-call voor adres → lat/long; wordt
// automatisch getriggerd zodra adres/postcode/stad wordt bijgewerkt.
// AiModule levert WebsiteAnalyzerService voor de "Analyseer website"-knop.
// AuditLogModule voor het loggen van mutaties (compliance + debugging).
// AnonymizationModule voor de "right to be forgotten"-flow: laatste
// vangnet voor afgeronde campagnes vóór ze door de cascade verdwijnen.
@Module({
  imports: [
    SupabaseModule,
    MeModule,
    GeocodingModule,
    AiModule,
    AuditLogModule,
    AnonymizationModule,
  ],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    DataExportService,
    AccountDeletionService,
    AuthGuard,
    BusinessAccessGuard,
  ],
})
export class BusinessModule {}
