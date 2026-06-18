import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { MetaService } from './meta.service';
import { Public } from '../common/public.decorator';

// ============================================================
// Meta-callbacks — server-to-server (GEEN guards)
// ============================================================
// Meta roept deze endpoints aan zónder ingelogde user; authenticatie
// gebeurt via de signed_request-handtekening (zie MetaService). Daarom
// staat hier BEWUST geen @UseGuards. AuthGuard is niet globaal, dus
// zonder @UseGuards zijn deze routes publiek.
//
// De web-routes (/oauth/meta/deauthorize + /oauth/meta/data-deletion)
// op get-filly.com sturen de signed_request hier naartoe.
// @Public(): globale AuthGuard slaat deze callbacks over; authenticatie is de
// signed_request-HMAC in MetaService (geen user-JWT bij Meta-server-calls).
@Public()
@Controller('integrations/meta')
export class MetaWebhookController {
  constructor(private readonly meta: MetaService) {}

  // POST /api/integrations/meta/deauthorize   body { signed_request }
  @Post('deauthorize')
  @HttpCode(200)
  deauthorize(@Body() body: { signed_request?: string }) {
    if (!body?.signed_request) {
      throw new BadRequestException('signed_request ontbreekt');
    }
    return this.meta.deauthorize(body.signed_request);
  }

  // POST /api/integrations/meta/data-deletion  body { signed_request }
  // → { url, confirmation_code }
  @Post('data-deletion')
  @HttpCode(200)
  dataDeletion(@Body() body: { signed_request?: string }) {
    if (!body?.signed_request) {
      throw new BadRequestException('signed_request ontbreekt');
    }
    return this.meta.requestDataDeletion(body.signed_request);
  }
}
