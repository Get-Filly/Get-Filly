import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MailDomainService } from './mail-domain.service';
import { BusinessId } from '../common/business-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { BusinessAccessGuard } from '../common/business-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// Endpoints onder /restaurant/me/mail-domain, vereist auth + tenant.
// Hoort logisch bij de restaurant-instellingen, vandaar de URL-prefix.
@UseGuards(AuthGuard, BusinessAccessGuard)
@Controller('restaurant/me/mail-domain')
export class MailDomainController {
  constructor(private readonly service: MailDomainService) {}

  // Huidige status (none/pending/verified/failed) + DNS-records die
  // nog op DNS-niveau gezet moeten worden. Frontend pollt dit elke
  // 10s in pending-modus totdat verified of failed.
  @Get()
  getStatus(@BusinessId() businessId: string) {
    return this.service.getStatus(businessId);
  }

  // Domein registreren bij Resend. Body: { domain, fromAddress }.
  // Returnt direct de DNS-records zodat de UI ze kan tonen.
  @Post()
  register(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { domain?: string; fromAddress?: string },
  ) {
    if (!body.domain || !body.fromAddress) {
      throw new BadRequestException(
        'Vul zowel het domein als het verzendadres in.',
      );
    }
    return this.service.register(
      businessId,
      body.domain,
      body.fromAddress,
      user.id,
    );
  }

  // Verify-trigger: forceert Resend om DNS opnieuw te checken. Eigenaar
  // klikt deze nadat 'ie de records bij z'n DNS-host heeft toegevoegd.
  @Post('verify')
  verify(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.verify(businessId, user.id);
  }

  // Koppeling verbreken: domein verdwijnt bij Resend, mail-flow valt
  // terug op social@get-filly.com. Eigenaar kan daarna een ander
  // domein registreren als gewenst.
  @Delete()
  remove(
    @BusinessId() businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(businessId, user.id);
  }
}
