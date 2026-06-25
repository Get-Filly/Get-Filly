import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { type Request } from 'express';
import { MailService } from './mail.service';
import { Public } from '../common/public.decorator';
import { verifySvixSignature } from '../common/svix-verify';

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
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mail: MailService) {}

  // ============================================================
  // Resend webhook
  // ============================================================
  // Resend stuurt events naar deze URL bij delivered/bounced/opened/
  // clicked/complained. URL ingesteld in Resend dashboard → Webhooks.
  //
  // Svix-signature-validatie: Resend ondertekent elke webhook. We
  // verifiëren de svix-headers tegen de rauwe body en weigeren vervalste
  // calls (401). FAIL-CLOSED: zonder RESEND_WEBHOOK_SECRET (of zonder
  // rawBody) kunnen we de afzender niet vaststellen, dus weigeren we de
  // call i.p.v. ongeverifieerde mail-stats weg te schrijven die een
  // aanvaller kan vervalsen.
  // ⚠️ Vereist: RESEND_WEBHOOK_SECRET in de API-env (Vercel). Zonder die
  // env worden ALLE webhook-events geweigerd.
  @Public()
  @Post('webhooks/resend')
  async receiveWebhook(
    @Body() payload: unknown,
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ): Promise<{ ok: true }> {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error(
        'Resend-webhook geweigerd: RESEND_WEBHOOK_SECRET niet gezet — kan afzender niet verifiëren.',
      );
      throw new UnauthorizedException();
    }
    const raw = req.rawBody?.toString('utf8');
    if (!raw) {
      this.logger.error(
        'Resend-webhook geweigerd: rawBody ontbreekt — signature niet te verifiëren (controleer rawBody-config).',
      );
      throw new UnauthorizedException();
    }
    if (
      !verifySvixSignature(
        raw,
        { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
        secret,
      )
    ) {
      this.logger.warn('Resend-webhook geweigerd: ongeldige Svix-signature.');
      throw new UnauthorizedException();
    }

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
