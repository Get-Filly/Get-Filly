import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { Public } from '../common/public.decorator';

// ============================================================
// MailController, publieke routes voor webhook + unsubscribe
// ============================================================
//
// Beide endpoints zijn @Public(), geen auth-token vereist:
// - Resend webhook: stuurt events vanuit hun servers, wij valideren
//   via signature-secret (toekomstige uitbreiding) ipv JWT.
// - Unsubscribe: één klik vanuit een mail moet werken zonder dat de
//   gast hoeft in te loggen. De token zelf is het auth-mechanisme
//   (256 bits random, niet raadbaar).
//
// De campagne-send-endpoint (POST /api/campaigns/:id/send) zit NIET
// hier maar in CampaignsController, daar is de hele auth + tenant-
// guard al actief.
// ============================================================

@Controller()
export class MailController {
  constructor(private readonly mail: MailService) {}

  // ============================================================
  // Resend webhook
  // ============================================================
  // Resend stuurt events naar deze URL bij delivered/bounced/opened/
  // clicked/complained. URL ingesteld in Resend dashboard → Webhooks.
  //
  // TODO (productie): valideer Svix-signature header. Resend gebruikt
  // Svix voor webhook-signing. Voor nu accepteren we alle calls, in
  // dev draait er niemand verkeerds op deze URL, in productie staat
  // er een URL achter een geheime path. Bij de eerste live-deploy
  // toevoegen: header svix-signature + secret uit RESEND_WEBHOOK_SECRET.
  @Public()
  @Post('webhooks/resend')
  async receiveWebhook(@Body() payload: unknown): Promise<{ ok: true }> {
    if (
      payload &&
      typeof payload === 'object' &&
      'type' in payload &&
      'data' in payload
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.mail.handleWebhook(payload as any);
    }
    return { ok: true };
  }

  // ============================================================
  // Unsubscribe via token
  // ============================================================
  // Wordt gebruikt door:
  // 1. De /u/[token]-pagina op de web-frontend (gast klikt op link
  //    in mail → frontend toont nette UI → call hierheen)
  // 2. List-Unsubscribe one-click POST van Gmail/Outlook (RFC 8058),
  //    de mail-headers wijzen naar deze URL en mail-clients kunnen 'r
  //    direct heen POSTen zonder browser-flow.
  //
  // Idempotent: meerdere keren aanroepen geeft dezelfde response,
  // 2e keer doet niks extra (token.used_at blijft staan).
  @Public()
  @Post('public/unsubscribe/:token')
  async unsubscribe(
    @Param('token') token: string,
  ): Promise<{ restaurantName: string; ok: true }> {
    const result = await this.mail.unsubscribeByToken(token);
    return { ok: true, restaurantName: result.restaurantName };
  }

  // GET-variant zodat een mail-client zonder POST-support nog steeds
  // kan unsubscriben. Beide doen hetzelfde aan de DB-kant.
  @Public()
  @Get('public/unsubscribe/:token')
  async unsubscribeGet(
    @Param('token') token: string,
  ): Promise<{ restaurantName: string; ok: true }> {
    const result = await this.mail.unsubscribeByToken(token);
    return { ok: true, restaurantName: result.restaurantName };
  }

  // ============================================================
  // Contact / demo-aanvraag vanaf de publieke site
  // ============================================================
  // Het contactformulier op /contact POST hierheen, geen auth: dit is
  // een lead vóór er een account bestaat. De service valideert alle
  // velden serverside, filtert bots via de honeypot en mailt de
  // aanvraag naar info@get-filly.com (reply-to = de bezoeker).
  @Public()
  @Post('public/contact')
  async contact(
    @Body()
    body: {
      name?: string;
      restaurant?: string;
      email?: string;
      phone?: string;
      message?: string;
      honeypot?: string;
    },
  ): Promise<{ ok: true }> {
    await this.mail.sendContactRequest({
      name: body.name ?? '',
      restaurant: body.restaurant ?? '',
      email: body.email ?? '',
      phone: body.phone,
      message: body.message ?? '',
      honeypot: body.honeypot,
    });
    return { ok: true };
  }
}
