import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailDomainService } from './mail-domain.service';
import { MailController } from './mail.controller';
import { MailDomainController } from './mail-domain.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogModule } from '../common/audit-log.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// MailService levert de send-flow (gebruikt door CampaignsModule)
// + webhook-handler + unsubscribe-flow.
// MailDomainService levert de eigen-domein-flow (Resend Domains API)
// die de account-pagina gebruikt om een klant z'n eigen verzendadres
// te laten configureren.
// SupabaseModule levert beide supabase-clients (admin voor webhook,
// request-scoped voor send + domein-flow).
@Module({
  // MeModule levert RestaurantAccessService — die de
  // RestaurantAccessGuard gebruikt om tenant-toegang te checken op de
  // domein-endpoints.
  imports: [SupabaseModule, AuditLogModule, MeModule],
  controllers: [MailController, MailDomainController],
  providers: [MailService, MailDomainService, AuthGuard, RestaurantAccessGuard],
  exports: [MailService],
})
export class MailModule {}
