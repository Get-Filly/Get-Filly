import { Module } from '@nestjs/common';
import { BusinessMediaService } from './business-media.service';
import { MediaTaggerService } from './media-tagger.service';
import { BusinessMediaController } from './business-media.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../common/audit-log.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

// AiModule levert AiService.generateStructuredFromFile voor de
// Vision-tag-flow bij upload. MeModule levert BusinessAccessService
// (door BusinessAccessGuard gebruikt). AuditLogModule logt elke
// upload/delete voor traceerbaarheid.
@Module({
  imports: [SupabaseModule, AiModule, AuditLogModule, MeModule],
  controllers: [BusinessMediaController],
  providers: [
    BusinessMediaService,
    MediaTaggerService,
    AuthGuard,
    BusinessAccessGuard,
  ],
  exports: [BusinessMediaService],
})
export class BusinessMediaModule {}
