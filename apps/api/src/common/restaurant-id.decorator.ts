import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { RestaurantAccess } from './restaurant-access.service';

/**
 * ============================================================
 * @RestaurantId() — leest de ID van het actieve restaurant
 * ============================================================
 *
 * Vroeger:
 *   Deze decorator las blind de 'X-Restaurant-Id' header en viel
 *   terug op een demo-id. Dat was NIET veilig — iedereen kon zich
 *   voordoen als elk restaurant.
 *
 * Nu:
 *   We vertrouwen volledig op de RestaurantAccessGuard. Die:
 *     - leest de header
 *     - controleert dat de user bij dit restaurant hoort
 *     - zet req.restaurant
 *   Deze decorator leest daar alleen de ID uit. Als de guard niet
 *   heeft gedraaid, gooien we een interne fout (500) — want dan is
 *   er een programmeerfout in de controller-setup.
 *
 * Gebruik (samen met @UseGuards(AuthGuard, RestaurantAccessGuard)):
 *   @Get()
 *   getKpis(@RestaurantId() restaurantId: string) {
 *     return this.service.getKpis(restaurantId);
 *   }
 */
export const RestaurantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ restaurant?: RestaurantAccess }>();

    if (!req.restaurant) {
      // Deze fout gaat NIET naar een aanvaller — hij ziet 500 maar
      // in de server-logs zie jij deze duidelijke melding. Fix:
      // zet @UseGuards(AuthGuard, RestaurantAccessGuard) op de
      // controller/methode.
      throw new InternalServerErrorException(
        '@RestaurantId() gebruikt zonder RestaurantAccessGuard — zet @UseGuards op de controller.',
      );
    }

    return req.restaurant.restaurantId;
  },
);
