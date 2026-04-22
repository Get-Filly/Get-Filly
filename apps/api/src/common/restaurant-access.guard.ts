import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { RestaurantAccessService, RestaurantAccess } from './restaurant-access.service';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * ============================================================
 * RestaurantAccessGuard — controleert toegang tot een restaurant
 * ============================================================
 *
 * Volgorde-afspraak:
 *   Deze guard DRAAIT PAS NA de AuthGuard. Die heeft namelijk al
 *   req.user gezet. Zonder ingelogde user kan deze guard niks.
 *
 * Wat doet deze guard:
 *   1. Leest de 'X-Restaurant-Id' header van de request.
 *      Geen header? → 400 Bad Request. (Dit is geen auth-probleem,
 *      maar de frontend is vergeten welk restaurant actief is.)
 *   2. Roept RestaurantAccessService.requireAccess() aan. Die doet
 *      de echte check in de database en gooit 403 als de user
 *      niet bij dit restaurant hoort.
 *   3. Plakt het resultaat op req.restaurant zodat decorators
 *      (@CurrentRestaurant, @RestaurantId) het kunnen lezen.
 *
 * Hoe gebruik je het:
 *   @UseGuards(AuthGuard, RestaurantAccessGuard)
 *   @Controller('kpi')
 *   export class KpiController { ... }
 *
 *   Of voor het hele systeem globaal via APP_GUARD in AppModule —
 *   dan geldt het automatisch overal (behalve op @Public endpoints).
 */
@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(private readonly access: RestaurantAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      restaurant?: RestaurantAccess;
      headers: Record<string, string | string[] | undefined>;
    }>();

    // -------- Stap 1: er moet een ingelogde user zijn --------
    // Deze guard vertrouwt erop dat AuthGuard als eerste heeft
    // gedraaid. Zo niet: developer-fout in de guard-volgorde.
    if (!req.user) {
      throw new BadRequestException(
        'RestaurantAccessGuard draait zonder AuthGuard — developer-fout.',
      );
    }

    // -------- Stap 2: lees X-Restaurant-Id header --------
    const rawHeader = req.headers['x-restaurant-id'];
    const restaurantId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (typeof restaurantId !== 'string' || restaurantId.trim().length === 0) {
      throw new BadRequestException(
        'X-Restaurant-Id header ontbreekt. De frontend moet altijd aangeven welk restaurant actief is.',
      );
    }

    // -------- Stap 3: verifieer toegang (gooit 403/404 als niet mag) --------
    const access = await this.access.requireAccess(
      req.user.id,
      restaurantId.trim(),
    );

    // -------- Stap 4: zet op request zodat decorators het kunnen lezen --------
    req.restaurant = access;

    return true;
  }
}
