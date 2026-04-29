import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

@Module({
  imports: [SupabaseModule, MeModule, AuditLogModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, AuthGuard, RestaurantAccessGuard],
  // Exporteren zodat AiModule reserveringen kan ophalen voor context-
  // injectie in Filly-prompts.
  exports: [ReservationsService],
})
export class ReservationsModule {}
