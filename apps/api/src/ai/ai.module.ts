import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

// AiModule exporteert alleen de service zodat andere modules
// (ReviewsModule, SuggestionsModule, enz.) hem kunnen injecteren
// via hun eigen imports-array. Zelfde patroon als SupabaseModule.
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
