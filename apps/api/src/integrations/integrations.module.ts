import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogModule } from '../common/audit-log.module';
import { IntegrationsController } from './integrations.controller';
import { CrmInviteService } from './crm-invite.service';
import { CrmApiKeyGuard } from './crm-api-key.guard';

// ============================================================
// IntegrationsModule — externe systeem-koppelingen (bv. het CRM)
// ============================================================
// Bundelt de server-to-server endpoints. Importeert SupabaseModule
// (service_role-client voor de admin-invite) en AuditLogModule (logt
// elke uitnodiging). ConfigService is globaal beschikbaar.
@Module({
  imports: [SupabaseModule, AuditLogModule],
  controllers: [IntegrationsController],
  providers: [CrmInviteService, CrmApiKeyGuard],
})
export class IntegrationsModule {}
