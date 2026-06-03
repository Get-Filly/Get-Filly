import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogService } from '../common/audit-log.service';

// Simpele e-mail-check (zelfde patroon als elders in de codebase). Niet
// RFC-volledig, wel genoeg om typo's en onzin tegen te houden.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CrmInviteResult = { status: 'invited' | 'already_exists' };

// ============================================================
// CrmInviteService — nodigt een nieuwe klant uit vanuit het CRM
// ============================================================
// Maakt (via service_role) een Supabase-account aan en laat Supabase de
// invite-mail sturen (onze eigen template met de onboarding-tips). De
// redirect wijst naar /welkom, waar de klant zijn wachtwoord instelt;
// daarna stuurt de middleware 'm automatisch de onboarding in.
//
// service_role (SupabaseService), NIET de per-request user-client: dit is
// een admin-flow zonder ingelogde gebruiker (net als TeamService).
@Injectable()
export class CrmInviteService {
  private readonly logger = new Logger(CrmInviteService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  async inviteCustomer(
    input: { email: string },
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<CrmInviteResult> {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestException('Ongeldig e-mailadres.');
    }

    // Waar de klant na het accepteren van de invite landt: /welkom
    // (wachtwoord instellen). WEB_URL is de publieke front-end-URL en
    // moet als redirect-URL in Supabase whitelisted staan.
    const webUrl = this.config.get<string>('WEB_URL')?.trim();
    if (!webUrl) {
      this.logger.error('WEB_URL ontbreekt in de env — kan geen invite sturen.');
      throw new InternalServerErrorException(
        'Server niet correct geconfigureerd.',
      );
    }
    const redirectTo = `${webUrl.replace(/\/+$/, '')}/welkom`;

    const { data, error } =
      await this.supabase.client.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });

    if (error) {
      // "Bestaat al" is geen fout voor de CRM-kant: idempotent gedrag,
      // geen dubbele mail. Zelfde detectie als in TeamService.
      const msg = (error.message || '').toLowerCase();
      const userExists =
        msg.includes('already been registered') ||
        msg.includes('already registered') ||
        msg.includes('user already exists');

      if (userExists) {
        await this.audit.log({
          restaurantId: null,
          userId: null,
          action: 'customer_invite_skipped_exists',
          entity_type: 'user',
          payload: { email, source: 'crm' },
          ip_address: meta.ip ?? null,
          user_agent: meta.userAgent ?? null,
        });
        return { status: 'already_exists' };
      }

      this.logger.error(`CRM-invite faalde voor ${email}: ${error.message}`);
      throw new InternalServerErrorException('Uitnodigen mislukt.');
    }

    await this.audit.log({
      restaurantId: null,
      userId: data?.user?.id ?? null,
      action: 'customer_invited',
      entity_type: 'user',
      entity_id: data?.user?.id ?? null,
      payload: { email, source: 'crm' },
      ip_address: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
    });

    this.logger.log(`CRM-invite verstuurd naar ${email}.`);
    return { status: 'invited' };
  }
}
