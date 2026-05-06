import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogService } from './audit-log.service';

// AuditLogModule, globale beschikbaarheid van de schrijf-helper voor
// de audit_log-tabel. Andere modules importeren deze module en kunnen
// dan AuditLogService injecten.
@Module({
  imports: [SupabaseModule],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
