import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RestaurantAccess } from './restaurant-access.service';

/**
 * ============================================================
 * @CurrentRestaurant() — alle info over het actieve restaurant
 * ============================================================
 *
 * Gebruik:
 *   @Get('summary')
 *   getSummary(@CurrentRestaurant() ctx: RestaurantAccess) {
 *     console.log(ctx.restaurantId, ctx.role, ctx.permissions);
 *     ...
 *   }
 *
 * Voorwaarde:
 *   De RestaurantAccessGuard moet hebben gedraaid. Die zet
 *   req.restaurant. Zonder die guard is er geen data en geeft
 *   deze decorator undefined terug.
 */
export const CurrentRestaurant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RestaurantAccess | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ restaurant?: RestaurantAccess }>();
    return req.restaurant;
  },
);
