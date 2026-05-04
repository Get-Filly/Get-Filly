import { Module } from '@nestjs/common';
import { RestaurantMediaService } from './restaurant-media.service';
import { MediaTaggerService } from './media-tagger.service';
import { RestaurantMediaController } from './restaurant-media.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';

// AiModule levert AiService.generateStructuredFromFile voor de
// Vision-tag-flow bij upload. MeModule levert RestaurantAccessService
// (door RestaurantAccessGuard gebruikt). AuditLogModule logt elke
// upload/delete voor traceerbaarheid.
@Module({
  imports: [SupabaseModule, AiModule, AuditLogModule, MeModule],
  controllers: [RestaurantMediaController],
  providers: [
    RestaurantMediaService,
    MediaTaggerService,
    AuthGuard,
    RestaurantAccessGuard,
  ],
  exports: [RestaurantMediaService],
})
export class RestaurantMediaModule {}
