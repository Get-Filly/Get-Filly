import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';
import { SeoReportController } from './seo-report.controller';
import { SeoReportService } from './seo-report.service';

// Wekelijks AI-vindbaarheid-rapport over get-filly.com.
// AiModule levert AiService (Claude-analyse), MailModule levert
// MailService (Resend-verzending). ConfigService is globaal.
@Module({
  imports: [AiModule, MailModule],
  controllers: [SeoReportController],
  providers: [SeoReportService],
})
export class SeoReportModule {}
