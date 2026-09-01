import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageProviderService } from './image-provider.service';
import { ImageStudioService } from './image-studio.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuditLogModule } from '../common/audit-log.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';

// Filly-beeldtool: genereren + bewerken van campagne-foto's via een
// aparte beeld-provider (Gemini). Los van AiModule omdat dat een
// tekst/vision-only Claude-wrapper is; beeld-generatie is een eigen laag.
//
// SupabaseModule → RequestSupabaseService (campagne/storage) + SupabaseService
//   (image_usage-caps). MeModule → BusinessAccessService voor de guard.
//   AuditLogModule → traceerbaarheid van beeld-acties.
@Module({
  imports: [SupabaseModule, AuditLogModule, MeModule],
  controllers: [ImageController],
  providers: [
    ImageProviderService,
    ImageStudioService,
    AuthGuard,
    BusinessAccessGuard,
  ],
  exports: [ImageProviderService, ImageStudioService],
})
export class ImageModule {}
