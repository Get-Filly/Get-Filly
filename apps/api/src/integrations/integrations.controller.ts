import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CrmApiKeyGuard } from './crm-api-key.guard';
import { CrmInviteService } from './crm-invite.service';

// ============================================================
// Integraties — server-to-server koppelingen (geen ingelogde user)
// ============================================================
// Beveiligd met CrmApiKeyGuard (gedeelde sleutel), NIET met de gewone
// AuthGuard. Het CRM roept dit aan om een nieuwe klant uit te nodigen.
@Controller('integrations/crm')
@UseGuards(CrmApiKeyGuard)
export class IntegrationsController {
  constructor(private readonly crmInvite: CrmInviteService) {}

  // POST /api/integrations/crm/invite   body: { email }
  // 200 { ok: true, status: 'invited' | 'already_exists' }
  // 400 ongeldig e-mailadres · 401 sleutel ontbreekt/onjuist
  @Post('invite')
  @HttpCode(200)
  async invite(@Body() body: { email?: string }, @Req() req: Request) {
    const result = await this.crmInvite.inviteCustomer(
      { email: body?.email ?? '' },
      {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
    return { ok: true, status: result.status };
  }
}
