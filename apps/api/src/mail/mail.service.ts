import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { SupabaseService } from '../supabase/supabase.service';
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { AuditLogService } from '../common/audit-log.service';
import { addUtmToAllLinks } from '../common/utm';

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

const DEFAULT_FROM_ADDRESS = 'social@get-filly.com';
const RESEND_BATCH_SIZE = 100; // Resend's max per batch.send

// Hoe een mail-recipient eruit ziet voor de send-flow. guestId is
// optioneel, eigenaar kan handmatig 1-op-1 mailen aan een adres dat
// niet als gast geregistreerd staat (bv. lead-flow), maar voor
// campagnes is 't bijna altijd gevuld.
export type MailRecipient = {
  email: string;
  name?: string;
  guestId?: string | null;
};

export type SendCampaignResult = {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  failures: Array<{ email: string; error: string }>;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly webUrl: string;

  constructor(
    config: ConfigService,
    private readonly admin: SupabaseService,
    private readonly userScoped: RequestSupabaseService,
    private readonly audit: AuditLogService,
  ) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY ontbreekt in .env, zonder kunnen we geen campagne-mails versturen.',
      );
    }
    this.resend = new Resend(apiKey);
    this.webUrl =
      config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  // ============================================================
  // SEND BY MODE, resolved recipients + send-flow
  // ============================================================
  // Wordt vanuit de campagne-controller aangeroepen. Mode bepaalt
  // wie de mail krijgt:
  //   - 'test'         → 1 mail naar opgegeven testEmail (eigenaar
  //                      kan z'n eigen adres gebruiken om visueel
  //                      te checken hoe de mail eruit ziet)
  //   - 'all_opted_in' → alle gasten met mail_opt_in=true en geldig
  //                      email-adres bij dit restaurant
  // De resolve-stap loopt via de RLS-client zodat ook de recipient-
  // lookup tenant-veilig is.
  async sendCampaignByMode(
    restaurantId: string,
    campaignId: string,
    mode: 'test' | 'all_opted_in',
    options: { testEmail?: string },
    userId: string,
  ): Promise<SendCampaignResult> {
    let recipients: MailRecipient[];

    if (mode === 'test') {
      const email = options.testEmail?.trim();
      if (!email || !isValidEmail(email)) {
        throw new BadRequestException(
          'Geef een geldig test-mailadres op om de campagne naar te versturen.',
        );
      }
      recipients = [{ email }];
    } else {
      // all_opted_in
      const { data: guests, error } = await this.userScoped.client
        .from('guests')
        .select('id, first_name, last_name, email')
        .eq('restaurant_id', restaurantId)
        .eq('mail_opt_in', true)
        .not('email', 'is', null);
      if (error) throw new InternalServerErrorException(error.message);

      type Row = {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      };
      const valid = ((guests ?? []) as Row[]).filter(
        (g): g is Row & { email: string } =>
          typeof g.email === 'string' && isValidEmail(g.email),
      );

      if (valid.length === 0) {
        throw new BadRequestException(
          'Geen gasten gevonden met opt-in en geldig e-mailadres. Voeg eerst gasten toe of zet hun mail_opt_in op aan.',
        );
      }

      recipients = valid.map((g) => ({
        email: g.email,
        name: [g.first_name, g.last_name].filter(Boolean).join(' ') || undefined,
        guestId: g.id,
      }));
    }

    return this.sendCampaign(restaurantId, campaignId, recipients, userId);
  }

  // ============================================================
  // RECIPIENTS PREVIEW, gebruikt door verstuur-UI op detail-page
  // ============================================================
  // Returnt het aantal gasten dat in 'all_opted_in'-mode bereikt zou
  // worden + eerste 5 namen ter herkenning. Eigenaar ziet hierop
  // "47 gasten, waaronder Anna, Mark, Sophie…" en weet wat 'ie
  // verstuurt voordat 'ie op de send-knop drukt.
  async getRecipientsPreview(
    restaurantId: string,
  ): Promise<{
    totalCount: number;
    sampleNames: string[];
    ownerEmail: string | null;
  }> {
    const [guestsRes, restRes] = await Promise.all([
      this.userScoped.client
        .from('guests')
        .select('first_name, last_name, email')
        .eq('restaurant_id', restaurantId)
        .eq('mail_opt_in', true)
        .not('email', 'is', null)
        .limit(5),
      this.userScoped.client
        .from('restaurants')
        .select('contact_email')
        .eq('id', restaurantId)
        .maybeSingle(),
    ]);

    // Aparte count-query voor het volledige aantal (de eerste query
    // is gelimit op 5 voor de sample, een COUNT geeft het echte totaal).
    const { count } = await this.userScoped.client
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('mail_opt_in', true)
      .not('email', 'is', null);

    type Row = {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    };
    const sample = ((guestsRes.data ?? []) as Row[])
      .map((g) => {
        const first = (g.first_name ?? '').trim();
        const last = (g.last_name ?? '').trim();
        const name = [first, last].filter(Boolean).join(' ').trim();
        return name || g.email || null;
      })
      .filter((n): n is string => !!n);

    return {
      totalCount: count ?? 0,
      sampleNames: sample,
      ownerEmail:
        ((restRes.data as { contact_email?: string | null } | null)
          ?.contact_email as string | null) ?? null,
    };
  }

  // ============================================================
  // SEND, verstuur een campagne naar een lijst recipients
  // ============================================================
  // Flow per recipient:
  //   1. Genereer unsubscribe-token (random 32 bytes hex) en sla op
  //   2. Insert campaign_sends-rij met status='queued'
  //   3. Bouw HTML met footer + unsubscribe-link
  //   4. Stop in Resend-batch
  //   5. Roep resend.batch.send aan (max 100 per batch)
  //   6. Update rijen met resend_message_id + status='sent'
  //
  // Bij Resend-fout: status='failed' + error-detail. Geen partial
  // rollback van de hele campagne, gefaalde recipients zien we via
  // status, eigenaar kan ze later opnieuw proberen.
  async sendCampaign(
    restaurantId: string,
    campaignId: string,
    recipients: MailRecipient[],
    userId: string,
  ): Promise<SendCampaignResult> {
    if (recipients.length === 0) {
      throw new BadRequestException('Geen ontvangers opgegeven.');
    }

    // Stap 1, campagne ophalen incl. content. Doen we via user-scoped
    // client zodat RLS controleert dat de user toegang heeft. Kolommen:
    // subject_line + body_html (of body_plain als fallback), komen uit
    // campaign_mail_content-tabel (zie migratie 0001).
    const { data: campaign, error: campErr } = await this.userScoped.client
      .from('campaigns')
      .select(
        'id, name, type, restaurant_id, campaign_mail_content(subject_line, body_html, body_plain, from_name, reply_to)',
      )
      .eq('id', campaignId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaign) throw new NotFoundException('Campagne niet gevonden.');
    if (campaign.type !== 'mail') {
      throw new BadRequestException(
        'Deze campagne is geen mail-campagne. Alleen mail-campagnes kunnen via deze flow verstuurd worden.',
      );
    }

    const mailContent = Array.isArray(campaign.campaign_mail_content)
      ? campaign.campaign_mail_content[0]
      : campaign.campaign_mail_content;
    // body_html heeft voorrang; body_plain als 'ie HTML mist (oudere
    // campagnes of door Filly als plain-text gegenereerd). Beide leeg
    // = niets om te versturen → nette NL-foutmelding.
    const subject = mailContent?.subject_line as string | null | undefined;
    const bodyHtml = mailContent?.body_html as string | null | undefined;
    const bodyPlain = mailContent?.body_plain as string | null | undefined;
    const rawBody = bodyHtml ?? (bodyPlain ? plainToHtml(bodyPlain) : null);
    if (!subject || !rawBody) {
      throw new BadRequestException(
        'Mail-onderwerp of -tekst ontbreekt. Vul de campagne eerst aan vóór versturen.',
      );
    }

    // Tag alle URLs in de body met consistente UTM-parameters
    // (filly-brein hfst 14.1). Idempotent: URLs die al utm_source
    // hebben blijven onveranderd. Doen we hier bij send-time zodat
    // de tagging altijd matched met de actuele campaign-naam, ook
    // na rename. Plain-text bodies worden eerst naar HTML omgezet,
    // dus dezelfde transformatie werkt op beide.
    const body = addUtmToAllLinks(rawBody, {
      source: 'mail',
      medium: 'newsletter',
      campaign: (campaign.name as string) ?? campaignId,
      content: campaignId, // unieke identifier; later: variant-index
    });

    // Stap 2, restaurant ophalen voor From-naam, reply-to en
    // eigen-domein-status. Geen restaurant gevonden = niet je tenant
    // (RLS); onmogelijk te bereiken vanaf de controllers, defense-in-depth.
    const { data: restaurant, error: restErr } = await this.userScoped.client
      .from('restaurants')
      .select(
        'name, contact_email, mail_domain_status, mail_from_address',
      )
      .eq('id', restaurantId)
      .maybeSingle();
    if (restErr) throw new InternalServerErrorException(restErr.message);
    if (!restaurant) throw new NotFoundException('Restaurant niet gevonden.');

    // Stap 3, bepaal From + Reply-To. Eigen domein verified → klant-
    // adres als From, geen reply-to nodig (replies komen direct binnen
    // bij klant). Anders default-vlow met social@get-filly.com.
    const fromAddress = this.resolveFromAddress(restaurant);
    const fromHeader = `${escapeQuotes(restaurant.name as string)} <${fromAddress}>`;
    const replyTo =
      restaurant.mail_domain_status === 'verified'
        ? undefined
        : (restaurant.contact_email as string | null) ?? undefined;

    // Stap 4, per recipient: token + send-rij. Bulk-insert beide
    // tabellen voor efficiency.
    const tokens = recipients.map(() => randomBytes(24).toString('hex'));
    const tokenRows = recipients.map((r, i) => ({
      token: tokens[i],
      restaurant_id: restaurantId,
      guest_id: r.guestId ?? null,
      email: r.email.toLowerCase().trim(),
    }));
    const { error: tokErr } = await this.admin.client
      .from('unsubscribe_tokens')
      .insert(tokenRows);
    if (tokErr) {
      throw new InternalServerErrorException(
        `Kon unsubscribe-tokens niet aanmaken: ${tokErr.message}`,
      );
    }

    const sendRows = recipients.map((r) => ({
      campaign_id: campaignId,
      guest_id: r.guestId ?? null,
      recipient_email: r.email.toLowerCase().trim(),
      status: 'queued' as const,
    }));
    const { data: insertedSends, error: sendErr } = await this.admin.client
      .from('campaign_sends')
      .insert(sendRows)
      .select('id, recipient_email');
    if (sendErr) {
      throw new InternalServerErrorException(
        `Kon send-history niet aanmaken: ${sendErr.message}`,
      );
    }

    // Map per email zodat we straks de juiste send-id en token kunnen
    // koppelen aan elke Resend-response.
    const sendIdByEmail = new Map<string, string>();
    for (const row of insertedSends ?? []) {
      sendIdByEmail.set(
        (row.recipient_email as string).toLowerCase(),
        row.id as string,
      );
    }
    const tokenByEmail = new Map<string, string>();
    recipients.forEach((r, i) => {
      tokenByEmail.set(r.email.toLowerCase().trim(), tokens[i]);
    });

    // Stap 5, bouw payload + verstuur in batches. Resend.batch.send
    // accepteert tot 100 mails per call; bij meer recipients chunks
    // we de array.
    const failures: Array<{ email: string; error: string }> = [];
    let sent = 0;

    for (let i = 0; i < recipients.length; i += RESEND_BATCH_SIZE) {
      const slice = recipients.slice(i, i + RESEND_BATCH_SIZE);
      const payload = slice.map((r) => {
        const token = tokenByEmail.get(r.email.toLowerCase().trim())!;
        const unsubscribeUrl = `${this.webUrl}/u/${token}`;
        return {
          from: fromHeader,
          to: r.email,
          subject,
          html: this.wrapHtml(
            body,
            restaurant.name as string,
            unsubscribeUrl,
          ),
          replyTo,
          // List-Unsubscribe headers (RFC 8058). Gmail/Outlook tonen
          // dan een native "Unsubscribe"-link bovenaan de mail,
          // aanzienlijke deliverability-boost en GDPR-compliant.
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      try {
        const result = await this.resend.batch.send(payload);
        // Resend's response: { data: [{ id }, { id }, ...] }
        const ids = (result.data?.data ?? []) as Array<{ id: string }>;

        // Update rijen met resend_message_id + status='sent'
        for (let j = 0; j < slice.length; j++) {
          const r = slice[j];
          const sendId = sendIdByEmail.get(r.email.toLowerCase().trim());
          if (!sendId) continue;
          await this.admin.client
            .from('campaign_sends')
            .update({
              resend_message_id: ids[j]?.id ?? null,
              status: ids[j]?.id ? 'sent' : 'failed',
              status_detail: ids[j]?.id ? null : 'Geen Resend message-id ontvangen',
            })
            .eq('id', sendId);
          if (ids[j]?.id) sent++;
          else
            failures.push({
              email: r.email,
              error: 'Geen message-id van Resend',
            });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Resend batch.send faalde voor campagne ${campaignId}: ${msg}`,
        );
        // Hele slice faalde → markeer alle rijen als failed
        for (const r of slice) {
          const sendId = sendIdByEmail.get(r.email.toLowerCase().trim());
          if (!sendId) continue;
          await this.admin.client
            .from('campaign_sends')
            .update({ status: 'failed', status_detail: msg.slice(0, 500) })
            .eq('id', sendId);
          failures.push({ email: r.email, error: msg });
        }
      }
    }

    // Stap 6, audit-log. Eén event per send-batch (niet per recipient)
    // zodat het audit-log behapbaar blijft. Detail-info per recipient
    // staat in campaign_sends zelf.
    await this.audit.log({
      restaurantId,
      userId,
      action: 'campaign_sent',
      entity_type: 'campaign',
      entity_id: campaignId,
      payload: {
        total: recipients.length,
        sent,
        failed: failures.length,
        from_address: fromAddress,
      },
    });

    this.logger.log(
      `Campagne ${campaignId}: ${sent}/${recipients.length} verstuurd, ${failures.length} mislukt`,
    );

    return {
      campaignId,
      total: recipients.length,
      sent,
      failed: failures.length,
      failures,
    };
  }

  // ============================================================
  // HANDLEWEBHOOK, Resend-events binnen-update campaign_sends
  // ============================================================
  // Resend stuurt events naar onze webhook bij delivered/bounced/
  // opened/clicked/complained. Gebruikt admin-client want geen user-
  // context bij webhooks.
  //
  // Webhook-secret-validatie staat in de controller (svix-signature).
  async handleWebhook(payload: ResendWebhookEvent): Promise<void> {
    const messageId = payload?.data?.email_id;
    if (!messageId) {
      this.logger.warn(`Webhook zonder email_id genegeerd: ${payload?.type}`);
      return;
    }

    const update: Record<string, unknown> = {};
    const now = new Date().toISOString();

    switch (payload.type) {
      case 'email.delivered':
        update.status = 'delivered';
        update.delivered_at = now;
        break;
      case 'email.bounced':
        update.status = 'bounced';
        update.status_detail = payload.data.bounce?.message?.slice(0, 500);
        break;
      case 'email.complained':
        update.status = 'complained';
        break;
      case 'email.opened':
        update.opened_at = now;
        update.status = 'opened';
        break;
      case 'email.clicked':
        update.clicked_at = now;
        update.status = 'clicked';
        break;
      case 'email.sent':
        // Vaak al 'sent' bij ons; idempotent ok
        update.status = 'sent';
        break;
      default:
        this.logger.debug(`Webhook event ${payload.type} genegeerd.`);
        return;
    }

    const { data: sendRow, error } = await this.admin.client
      .from('campaign_sends')
      .update(update)
      .eq('resend_message_id', messageId)
      .select('campaign_id')
      .maybeSingle();
    if (error) {
      this.logger.warn(
        `Webhook-update faalde voor message ${messageId}: ${error.message}`,
      );
      return;
    }

    // Aggregeer ook in campaign_performance (filly-brein hfst 9.1).
    // Idempotente increment per event-type. Buiten try/catch want
    // performance-tracking mag de mail-flow nooit blokkeren.
    const campaignId = (sendRow as { campaign_id?: string } | null)?.campaign_id;
    if (campaignId) {
      const perfField = this.mapWebhookEventToPerfField(payload.type);
      if (perfField) {
        await this.incrementCampaignPerformance(campaignId, perfField).catch(
          (err) => {
            this.logger.warn(
              `campaign_performance increment gefaald (${perfField}): ${
                err instanceof Error ? err.message : err
              }`,
            );
          },
        );
      }
    }
  }

  /**
   * Mapt Resend-webhook-events naar campaign_performance-kolommen.
   * Returnt null voor events die we niet aggregeren (bv. email.sent
   * wordt al bij send geteld; email.complained tracken we voorlopig
   * niet apart maar via unsubscribe).
   */
  private mapWebhookEventToPerfField(
    type: string,
  ):
    | 'mail_delivered'
    | 'mail_opened'
    | 'mail_clicked'
    | 'mail_bounced'
    | null {
    switch (type) {
      case 'email.delivered':
        return 'mail_delivered';
      case 'email.opened':
        return 'mail_opened';
      case 'email.clicked':
        return 'mail_clicked';
      case 'email.bounced':
        return 'mail_bounced';
      default:
        return null;
    }
  }

  /**
   * Idempotente increment van één performance-veld. Maakt de rij aan
   * als die nog niet bestaat (een mail-event kan voor de status→actief-
   * trigger binnenkomen bij snelle delivery).
   */
  private async incrementCampaignPerformance(
    campaignId: string,
    field:
      | 'mail_delivered'
      | 'mail_opened'
      | 'mail_clicked'
      | 'mail_bounced',
  ): Promise<void> {
    // Eerst restaurant_id achterhalen via campaigns-FK.
    const { data: campaign, error: campErr } = await this.admin.client
      .from('campaigns')
      .select('restaurant_id')
      .eq('id', campaignId)
      .maybeSingle();
    if (campErr || !campaign) {
      this.logger.warn(
        `Kon restaurant_id niet vinden voor campaign ${campaignId}`,
      );
      return;
    }

    // Upsert rij + lees current value. Twee roundtrips; bij hoog
    // volume migreren we naar een Postgres RPC voor atomic increment.
    await this.admin.client.from('campaign_performance').upsert(
      {
        campaign_id: campaignId,
        restaurant_id: (campaign as { restaurant_id: string }).restaurant_id,
      },
      { onConflict: 'campaign_id', ignoreDuplicates: true },
    );

    const { data: row, error: readErr } = await this.admin.client
      .from('campaign_performance')
      .select(`id, ${field}`)
      .eq('campaign_id', campaignId)
      .maybeSingle();
    if (readErr || !row) return;

    const current = (row as Record<string, number | null>)[field] ?? 0;
    await this.admin.client
      .from('campaign_performance')
      .update({ [field]: current + 1 })
      .eq('campaign_id', campaignId);
  }

  // ============================================================
  // UNSUBSCRIBE, token → opt-out + token markeren als gebruikt
  // ============================================================
  // Publieke route: gast klikt link in mail → /u/<token>. Geen auth.
  // Effect: guests.mail_opt_in = false + token.used_at = now.
  // Idempotent, herhaaldelijk klikken doet niets nieuws.
  async unsubscribeByToken(
    token: string,
  ): Promise<{ restaurantName: string }> {
    const { data: tokenRow, error: tokErr } = await this.admin.client
      .from('unsubscribe_tokens')
      .select('token, restaurant_id, guest_id, email, used_at')
      .eq('token', token)
      .maybeSingle();
    if (tokErr) throw new InternalServerErrorException(tokErr.message);
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
      // niet kritisch maar handig voor reporting.
      await this.admin.client
        .from('campaign_sends')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('recipient_email', tokenRow.email)
        .gte(
          'sent_at',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        );
    }

    // Restaurant-naam ophalen voor de UI ("Je bent uitgeschreven van X")
    const { data: rest } = await this.admin.client
      .from('restaurants')
      .select('name')
      .eq('id', tokenRow.restaurant_id)
      .maybeSingle();

    return { restaurantName: (rest?.name as string) ?? 'het restaurant' };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private resolveFromAddress(restaurant: {
    mail_domain_status: string | null;
    mail_from_address: string | null;
  }): string {
    if (
      restaurant.mail_domain_status === 'verified' &&
      restaurant.mail_from_address
    ) {
      return restaurant.mail_from_address;
    }
    return DEFAULT_FROM_ADDRESS;
  }

  // Wrap de campagne-body in een minimale HTML-template met footer.
  // De body komt van de eigenaar / Filly en kan al HTML zijn,
  // we nesten 'm in een container met de unsubscribe-link onderaan.
  private wrapHtml(
    body: string,
    restaurantName: string,
    unsubscribeUrl: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#FAF7F1;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
    ${body}
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5;">
    <div style="font-size:11px;color:#6B6F71;line-height:1.5;text-align:center;">
      Verzonden door ${escapeHtml(restaurantName)} via Get Filly.<br>
      Wil je geen mails meer ontvangen? <a href="${unsubscribeUrl}" style="color:#6B6F71;">Klik hier om uit te schrijven</a>.
    </div>
  </div>
</body>
</html>`;
  }
}

// Minimaal type voor Resend's webhook events. We gebruiken alleen
// 'type' + 'data.email_id' + 'data.bounce' (bij bounces). Andere
// velden negeren we.
type ResendWebhookEvent = {
  type: string;
  data: {
    email_id?: string;
    bounce?: { message?: string };
  };
};

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
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
