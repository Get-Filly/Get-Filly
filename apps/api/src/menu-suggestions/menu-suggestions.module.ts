import { Module } from '@nestjs/common';
import { MenuSuggestionsController } from './menu-suggestions.controller';
import { MenuSuggestionsService } from './menu-suggestions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import { AiRateLimitGuard } from '../common/ai-rate-limit.guard';

// SupabaseModule levert RequestSupabaseService (RLS-active) +
// SupabaseService (admin), wij gebruiken RequestSupabaseService.
// AiModule levert AiService + RestaurantContextService voor de
// generate/refine-flows.
// AuditLogModule logt elke generate/accept/reject/refine zodat we
// kunnen herleiden welke voorstellen waar vandaan kwamen.
@Module({
  imports: [SupabaseModule, MeModule, AiModule, AuditLogModule],
  controllers: [MenuSuggestionsController],
  providers: [
    MenuSuggestionsService,
    AuthGuard,
    RestaurantAccessGuard,
    AiRateLimitGuard,
  ],
})
export class MenuSuggestionsModule {}
