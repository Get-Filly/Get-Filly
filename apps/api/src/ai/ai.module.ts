import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { SupabaseModule } from '../supabase/supabase.module';

// AiModule exporteert alleen de service zodat andere modules
// (ReviewsModule, SuggestionsModule, enz.) hem kunnen injecteren
// via hun eigen imports-array. Zelfde patroon als SupabaseModule.
//
// SupabaseModule importeren we omdat AiService via service_role
// elke call in ai_usage logt voor kosten-inzicht + rate-limiting.
@Module({
  imports: [SupabaseModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
