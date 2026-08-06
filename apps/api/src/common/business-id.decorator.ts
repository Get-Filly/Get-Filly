import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { BusinessAccess } from './business-access.service';

/**
 * ============================================================
 * @BusinessId(), leest de ID van het actieve restaurant
 * ============================================================
 *
 * Vroeger:
 *   Deze decorator las blind de 'X-Business-Id' header en viel
 *   terug op een demo-id. Dat was NIET veilig, iedereen kon zich
 *   voordoen als elk restaurant.
 *
 * Nu:
 *   We vertrouwen volledig op de BusinessAccessGuard. Die:
 *     - leest de header
 *     - controleert dat de user bij dit restaurant hoort
 *     - zet req.restaurant
 *   Deze decorator leest daar alleen de ID uit. Als de guard niet
 *   heeft gedraaid, gooien we een interne fout (500), want dan is
 *   er een programmeerfout in de controller-setup.
 *
 * Gebruik (samen met @UseGuards(AuthGuard, BusinessAccessGuard)):
 *   @Get()
 *   getKpis(@BusinessId() businessId: string) {
 *     return this.service.getKpis(businessId);
 *   }
 */
export const BusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ restaurant?: BusinessAccess }>();

    if (!req.restaurant) {
      // Deze fout gaat NIET naar een aanvaller, hij ziet 500 maar
      // in de server-logs zie jij deze duidelijke melding. Fix:
      // zet @UseGuards(AuthGuard, BusinessAccessGuard) op de
      // controller/methode.
      throw new InternalServerErrorException(
        '@BusinessId() gebruikt zonder BusinessAccessGuard, zet @UseGuards op de controller.',
      );
    }

    return req.restaurant.businessId;
  },
);
