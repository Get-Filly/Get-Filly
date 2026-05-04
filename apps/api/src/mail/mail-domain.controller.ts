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
import { RestaurantId } from '../common/restaurant-id.decorator';
import { AuthGuard } from '../common/auth.guard';
import { RestaurantAccessGuard } from '../common/restaurant-access.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/current-user.decorator';

// Endpoints onder /restaurant/me/mail-domain — vereist auth + tenant.
// Hoort logisch bij de restaurant-instellingen, vandaar de URL-prefix.
@UseGuards(AuthGuard, RestaurantAccessGuard)
@Controller('restaurant/me/mail-domain')
export class MailDomainController {
  constructor(private readonly service: MailDomainService) {}

  // Huidige status (none/pending/verified/failed) + DNS-records die
  // nog op DNS-niveau gezet moeten worden. Frontend pollt dit elke
  // 10s in pending-modus totdat verified of failed.
  @Get()
  getStatus(@RestaurantId() restaurantId: string) {
    return this.service.getStatus(restaurantId);
  }

  // Domein registreren bij Resend. Body: { domain, fromAddress }.
  // Returnt direct de DNS-records zodat de UI ze kan tonen.
  @Post()
  register(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { domain?: string; fromAddress?: string },
  ) {
    if (!body.domain || !body.fromAddress) {
      throw new BadRequestException(
        'Vul zowel het domein als het verzendadres in.',
      );
    }
    return this.service.register(
      restaurantId,
      body.domain,
      body.fromAddress,
      user.id,
    );
  }

  // Verify-trigger: forceert Resend om DNS opnieuw te checken. Eigenaar
  // klikt deze nadat 'ie de records bij z'n DNS-host heeft toegevoegd.
  @Post('verify')
  verify(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.verify(restaurantId, user.id);
  }

  // Koppeling verbreken: domein verdwijnt bij Resend, mail-flow valt
  // terug op social@get-filly.com. Eigenaar kan daarna een ander
  // domein registreren als gewenst.
  @Delete()
  remove(
    @RestaurantId() restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(restaurantId, user.id);
  }
}
