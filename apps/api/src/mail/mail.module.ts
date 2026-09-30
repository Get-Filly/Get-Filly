import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { MeModule } from '../me/me.module';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';

// MailService verstuurt alleen nog mail van Get-Filly zelf: het
// contactformulier, feedback en het SEO-rapport aan onze klanten, plus de
// afmeld-flow. Get-Filly mailt GEEN gasten van klanten meer: campagne-mail,
// het eigen verzenddomein en de Resend-webhook voor campagne-statistieken zijn
// verwijderd (2026-09-30).
@Module({
  // MeModule levert BusinessAccessService voor de BusinessAccessGuard.
  imports: [SupabaseModule, MeModule],
  controllers: [MailController],
  providers: [MailService, AuthGuard, BusinessAccessGuard, RateLimitGuard],
  exports: [MailService],
})
export class MailModule {}
