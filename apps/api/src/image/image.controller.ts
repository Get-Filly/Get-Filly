import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ImageStudioService } from './image-studio.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// ============================================================
// ImageController, endpoints van de Filly-beeldtool
// ============================================================
//
// Genest onder de campagne (/campaigns/:campaignId/image/...) omdat elke
// beeld-actie aan een concept-campagne hangt. Guards op klasse-niveau:
// AuthGuard (geldig JWT) + BusinessAccessGuard (user hoort bij X-Business-Id).
// De maand-/uur-caps worden in de studio-service afgedwongen (die kent
// image_usage), vóór de dure provider-call.
// ============================================================

type CountBody = { count?: number };
type EditBody = { instruction?: string; count?: number };
type GenerateBody = { prompt?: string; count?: number };
type ApplyBody = { path?: string };

@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('campaigns/:campaignId/image')
export class ImageController {
  constructor(private readonly studio: ImageStudioService) {}

  // Laat de frontend weten of de beeldtool beschikbaar is (key gezet).
  // Zonder key verbergen we de knoppen liever dan ze te laten falen.
  @Get('status')
  status() {
    return { configured: this.studio.isConfigured() };
  }

  // Stand 1: de huidige campagne-foto mooier maken (fotografen-polish).
  @Post('enhance')
  async enhance(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Body() body: CountBody,
  ) {
    const count = body?.count ?? 1;
    await this.studio.assertUnderCaps(businessId, count);
    return this.studio.enhance(businessId, user.id, campaignId, count);
  }

  // Stand 2: de huidige foto aanpassen op instructie ("doe hier tapas op").
  @Post('edit')
  async edit(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Body() body: EditBody,
  ) {
    if (!body?.instruction) {
      throw new BadRequestException(
        'Geef een omschrijving van wat je wilt aanpassen.',
      );
    }
    const count = body?.count ?? 1;
    await this.studio.assertUnderCaps(businessId, count);
    return this.studio.edit(
      businessId,
      user.id,
      campaignId,
      body.instruction,
      count,
    );
  }

  // Stand 3: een foto genereren vanaf tekst (geen invoerfoto nodig).
  @Post('generate')
  async generate(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Body() body: GenerateBody,
  ) {
    if (!body?.prompt) {
      throw new BadRequestException(
        'Beschrijf kort welke foto Filly moet maken.',
      );
    }
    const count = body?.count ?? 1;
    await this.studio.assertUnderCaps(businessId, count);
    return this.studio.generate(
      businessId,
      user.id,
      campaignId,
      body.prompt,
      count,
    );
  }

  // Een goedgekeurde variant als foto van dit ene kanaal instellen.
  @Post('apply')
  apply(
    @BusinessId() businessId: string,
    @Param('campaignId') campaignId: string,
    @Body() body: ApplyBody,
  ) {
    if (!body?.path) {
      throw new BadRequestException('Geen foto-pad meegegeven.');
    }
    return this.studio.apply(businessId, campaignId, body.path);
  }

  // Fan-out: de gekozen master op ALLE kanalen van de bundel plaatsen, elk in
  // het juiste formaat. De studio bewaakt de caps (herkader-calls zijn duur).
  @Post('apply-all')
  applyAll(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId') campaignId: string,
    @Body() body: ApplyBody,
  ) {
    if (!body?.path) {
      throw new BadRequestException('Geen foto-pad meegegeven.');
    }
    return this.studio.applyAll(businessId, user.id, campaignId, body.path);
  }
}
