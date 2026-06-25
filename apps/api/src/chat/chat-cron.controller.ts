import {
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeBearer } from '../common/cron-secret';
import { Public } from '../common/public.decorator';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// Chat-cron — oude gesprekken automatisch opruimen (PUBLIEK)
// ============================================================
// Filly start elke kalenderdag een vers gesprek (getOrCreateActiveConversation),
// dus zonder opruimen stapelt de history zich op. Deze cron verwijdert
// gesprekken die > 7 dagen niet meer zijn aangeraakt (updated_at). De
// chat_messages cascaden mee via de FK. Geleerde voorkeuren leven los in
// restaurant_chat_memory en blijven dus bewaard.
//
// Context-loos (Vercel Cron, geen ingelogde user) → service-role admin-client.
// Beveiliging = de CRON_SECRET-bearer, net als de andere crons. @Public()
// slaat de globale AuthGuard over.
@Public()
@Controller('chat/cron')
export class ChatCronController {
  private readonly logger = new Logger(ChatCronController.name);
  // Gesprekken ouder dan dit (sinds laatste activiteit) worden opgeruimd.
  private readonly RETENTION_DAYS = 7;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  // GET /api/chat/cron/cleanup  (Vercel Cron)
  @Get('cleanup')
  async cleanup(@Headers('authorization') auth?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!timingSafeBearer(auth, secret)) {
      this.logger.warn(
        'chat/cron/cleanup geweigerd: ontbrekende of onjuiste cron-secret.',
      );
      throw new UnauthorizedException();
    }

    const cutoff = new Date(
      Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await this.supabase.client
      .from('chat_conversations')
      .delete()
      .lt('updated_at', cutoff)
      .select('id');
    if (error) {
      this.logger.error(`chat/cron/cleanup faalde: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }

    const deleted = data?.length ?? 0;
    this.logger.log(
      `Chat-cleanup klaar: ${deleted} gesprek(ken) ouder dan ${this.RETENTION_DAYS} dagen verwijderd.`,
    );
    return { deleted, retentionDays: this.RETENTION_DAYS };
  }
}
