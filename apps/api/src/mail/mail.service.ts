import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { throwDbError } from '../common/db-error';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// MailService, uitgaande mail via Resend
// ============================================================
//
// Stap 1 (default): mail komt van social@get-filly.com met
//   restaurant.name als From-naam, reply-to gaat naar
//   restaurant.contact_email. Werkt voor élke klant zonder
//   eigen domein-werk.
//
// Stap 2 (eigen domein): zodra restaurant.mail_domain_status =
//   'verified' valt de send-flow over op restaurant.mail_from_address
//   als From, pure klant-branding.
//
// Twee Supabase-clients gebruikt:
// - RequestSupabaseService voor de send-flow (RLS via user-JWT, alleen
//   eigen restaurant kan campagnes versturen)
// - SupabaseService voor de webhook-handler (Resend stuurt events zonder
//   user-context, admin-flow)
// ============================================================

// Afzender voor onze EIGEN systeem-/websitemails (bv. de demo-aanvraag die
// binnenkomt op info@). Bewust losgekoppeld van social@, zodat onze interne
// notificaties niet vermengd raken met het klant-campagne-adres. We sturen
// 'm vanaf info@: de aanvraag komt dus van én naar info@ — antwoorden gaan
// via reply-to naar de bezoeker, niet naar dit adres.
const WEBSITE_FROM_ADDRESS = 'info@get-filly.com';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly webUrl: string;

  constructor(
    config: ConfigService,
    private readonly admin: SupabaseService,
  ) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY ontbreekt in .env, zonder kunnen we geen campagne-mails versturen.',
      );
    }
    this.resend = new Resend(apiKey);
    this.webUrl = config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  // ============================================================
  // UNSUBSCRIBE, token → opt-out + token markeren als gebruikt
  // ============================================================
  // Publieke route: gast klikt link in mail → /u/<token>. Geen auth.
  // Effect: guests.mail_opt_in = false + token.used_at = now.
  // Idempotent, herhaaldelijk klikken doet niets nieuws.
  async unsubscribeByToken(token: string): Promise<{ restaurantName: string }> {
    const { data: tokenRow, error: tokErr } = await this.admin.client
      .from('unsubscribe_tokens')
      .select('token, business_id, guest_id, email, used_at')
      .eq('token', token)
      .maybeSingle();
    if (tokErr) throwDbError(this.logger, tokErr);
    if (!tokenRow) throw new NotFoundException('Onbekende unsubscribe-link.');

    // Markeer guest als opted-out (als 'ie nog bestaat, bij
    // right-to-be-forgotten kan guest_id null zijn dankzij ON DELETE
    // SET NULL, dan slaan we de guest-update over).
    if (tokenRow.guest_id) {
      await this.admin.client
        .from('guests')
        .update({ mail_opt_in: false })
        .eq('id', tokenRow.guest_id);
    }

    // Token markeren (idempotent, 2e klik mag, geen actie nodig)
    if (!tokenRow.used_at) {
      await this.admin.client
        .from('unsubscribe_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token', token);

      // Recente sends voor deze gast als 'unsubscribed' markeren,
      // niet kritisch maar handig voor reporting. We draaien op de
      // admin-client (RLS-bypass), dus we MOETEN zelf tenant-scopen:
      // campaign_sends heeft geen business_id, dus we beperken tot de
      // campagnes van DIT restaurant. Zonder die scope zou een unsubscribe
      // de reporting van álle restaurants raken waar dit mailadres ook
      // gast is (cross-tenant data-vervuiling).
      const { data: ownCampaigns } = await this.admin.client
        .from('campaigns')
        .select('id')
        .eq('business_id', tokenRow.business_id);
      const campaignIds = (ownCampaigns ?? []).map(
        (c) => (c as { id: string }).id,
      );
      if (campaignIds.length > 0) {
        await this.admin.client
          .from('campaign_sends')
          .update({ unsubscribed_at: new Date().toISOString() })
          .eq('recipient_email', tokenRow.email)
          .in('campaign_id', campaignIds)
          .gte(
            'sent_at',
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          );
      }
    }

    // Business-naam ophalen voor de UI ("Je bent uitgeschreven van X")
    const { data: rest } = await this.admin.client
      .from('businesses')
      .select('name')
      .eq('id', tokenRow.business_id)
      .maybeSingle();

    return { restaurantName: (rest?.name as string) ?? 'het restaurant' };
  }

  // ============================================================
  // Helpers
  // ============================================================

  // ============================================================
  // CONTACT / DEMO-AANVRAAG vanaf de publieke site
  // ============================================================
  // Het publieke contactformulier (/contact) POST hierheen. We sturen
  // de aanvraag als nette mail naar het Get Filly-team (info@) met het
  // adres van de bezoeker als reply-to, zodat het team direct kan
  // antwoorden. Géén tenant/RLS-context: dit is een lead vóór er een
  // account bestaat, dus geen user-scoped client.
  //
  // From staat op een geverifieerd get-filly.com-adres (anders weigert
  // Resend de mail). honeypot = anti-spam: een verborgen veld dat een
  // echte gebruiker nooit invult; is het gevuld, dan is 't een bot en
  // doen we alsof het gelukt is zonder te versturen.
  async sendContactRequest(input: {
    name: string;
    restaurant: string;
    email: string;
    phone?: string;
    message: string;
    honeypot?: string;
  }): Promise<void> {
    // Bot gedetecteerd via honeypot → stilletjes slikken (geen mail,
    // geen foutmelding, zodat de bot niet leert dat 't geblokkeerd is).
    if (input.honeypot && input.honeypot.trim().length > 0) {
      this.logger.warn('Contactformulier honeypot gevuld, mail overgeslagen.');
      return;
    }

    // Serverside-validatie, vertrouw nooit puur op de frontend.
    const name = input.name?.trim();
    const restaurant = input.restaurant?.trim();
    const email = input.email?.trim();
    const phone = input.phone?.trim();
    const message = input.message?.trim();

    if (!name || !restaurant || !email || !message) {
      throw new BadRequestException(
        'Vul je naam, restaurant, e-mailadres en bericht in.',
      );
    }
    if (!isValidEmail(email)) {
      throw new BadRequestException('Vul een geldig e-mailadres in.');
    }
    // Lengte-grenzen tegen misbruik en overgrote payloads.
    if (name.length > 120 || restaurant.length > 160 || message.length > 4000) {
      throw new BadRequestException('Een of meer velden zijn te lang.');
    }

    const to = 'info@get-filly.com';
    const subject = `Nieuwe demo-aanvraag, ${restaurant}`;

    // Nette HTML met de ingevulde velden + plain-text fallback.
    const rows: Array<[string, string]> = [
      ['Naam', name],
      ['Business', restaurant],
      ['E-mail', email],
      ['Telefoon', phone || '—'],
    ];
    const tableHtml = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#6B6F71;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#FAF7F1;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
    <h2 style="margin:0 0 16px;">Nieuwe demo-aanvraag</h2>
    <table style="border-collapse:collapse;font-size:14px;">${tableHtml}</table>
    <p style="margin:20px 0 4px;color:#6B6F71;font-size:14px;">Bericht:</p>
    <div style="font-size:14px;line-height:1.6;">${plainToHtml(message)}</div>
  </div>
</body></html>`;

    const text = [
      'Nieuwe demo-aanvraag',
      '',
      `Naam: ${name}`,
      `Business: ${restaurant}`,
      `E-mail: ${email}`,
      `Telefoon: ${phone || '—'}`,
      '',
      'Bericht:',
      message,
    ].join('\n');

    try {
      const { error } = await this.resend.emails.send({
        from: `Get Filly Website <${WEBSITE_FROM_ADDRESS}>`,
        to,
        replyTo: email,
        subject,
        html,
        text,
      });
      if (error) {
        this.logger.error(`Contact-mail versturen mislukt: ${error.message}`);
        throw new InternalServerErrorException(
          'Versturen mislukt. Probeer het later opnieuw of mail ons direct.',
        );
      }
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      this.logger.error(`Contact-mail onverwachte fout: ${String(e)}`);
      throw new InternalServerErrorException(
        'Versturen mislukt. Probeer het later opnieuw of mail ons direct.',
      );
    }
  }

  // ============================================================
  // FEEDBACK vanaf de Filly-chat (ingelogde gebruiker)
  // ============================================================
  // De disclaimer-regel onder de dashboard-chat linkt naar een klein
  // feedbackformulier. Bij versturen mailen we de feedback naar het
  // Get-Filly-team (info@) met de gebruiker als reply-to + de onderneming
  // als context. Message-only: de identiteit halen we uit de sessie (JWT +
  // BusinessAccessGuard), niet uit het formulier. From = geverifieerd
  // get-filly.com-adres (anders weigert Resend).
  async sendFeedback(input: {
    message: string;
    userEmail: string | null;
    userId: string;
    businessId?: string | null;
  }): Promise<void> {
    const message = input.message?.trim();
    if (!message) {
      throw new BadRequestException(
        'Schrijf even je feedback voordat je verstuurt.',
      );
    }
    if (message.length > 4000) {
      throw new BadRequestException(
        'Je feedback is te lang (max 4000 tekens).',
      );
    }

    // Onderneming voor context; fail-soft (naam is nice-to-have).
    let businessName: string | null = null;
    if (input.businessId) {
      const { data } = await this.admin.client
        .from('businesses')
        .select('name')
        .eq('id', input.businessId)
        .maybeSingle();
      businessName = (data?.name as string | null) ?? null;
    }

    const replyTo =
      input.userEmail && isValidEmail(input.userEmail)
        ? input.userEmail
        : undefined;
    const to = 'info@get-filly.com';
    const subject = `Nieuwe feedback via Filly-chat${
      businessName ? `, ${businessName}` : ''
    }`;

    const rows: Array<[string, string]> = [
      ['Van', input.userEmail || '—'],
      ['Onderneming', businessName || input.businessId || '—'],
      ['User-id', input.userId],
    ];
    const tableHtml = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#6B6F71;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#FAF7F1;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
    <h2 style="margin:0 0 16px;">Nieuwe feedback via Filly-chat</h2>
    <table style="border-collapse:collapse;font-size:14px;">${tableHtml}</table>
    <p style="margin:20px 0 4px;color:#6B6F71;font-size:14px;">Feedback:</p>
    <div style="font-size:14px;line-height:1.6;">${plainToHtml(message)}</div>
  </div>
</body></html>`;
    const text = [
      'Nieuwe feedback via Filly-chat',
      '',
      `Van: ${input.userEmail || '—'}`,
      `Onderneming: ${businessName || input.businessId || '—'}`,
      `User-id: ${input.userId}`,
      '',
      'Feedback:',
      message,
    ].join('\n');

    try {
      const { error } = await this.resend.emails.send({
        from: `Get-Filly <${WEBSITE_FROM_ADDRESS}>`,
        to,
        replyTo,
        subject,
        html,
        text,
      });
      if (error) {
        this.logger.error(`Feedback-mail versturen mislukt: ${error.message}`);
        throw new InternalServerErrorException(
          'Versturen mislukt. Probeer het later opnieuw.',
        );
      }
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      this.logger.error(`Feedback-mail onverwachte fout: ${String(e)}`);
      throw new InternalServerErrorException(
        'Versturen mislukt. Probeer het later opnieuw.',
      );
    }
  }

  /**
   * Verstuurt het wekelijkse interne vindbaarheid-rapport naar
   * info@get-filly.com (Filly → Get-Filly over de eigen site).
   * HTML + plain-text worden kant-en-klaar aangeleverd door de
   * SeoReportService.
   */
  async sendSeoReport(
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: `Get-Filly <${WEBSITE_FROM_ADDRESS}>`,
      to: WEBSITE_FROM_ADDRESS,
      subject,
      html,
      text,
    });
    if (error) {
      this.logger.error(
        `Vindbaarheid-rapport versturen mislukt: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Versturen van het vindbaarheid-rapport mislukt.',
      );
    }
  }
}

// Lichtgewicht email-validator. Strenger valideren is in alle praktische
// gevallen onnodig, Resend valideert nogmaals voordat 'ie verstuurt.
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Plain-text body → minimale HTML zodat Resend geen kale text-mail
// verstuurt. Behoudt alinea-breaks (dubbele newline) en harde
// regelovergangen; basis HTML-escape om injectie te voorkomen.
function plainToHtml(s: string): string {
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Dubbele newline → paragraaf-split, enkele newline → <br>
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`);
  return paragraphs.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
