import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BusinessAccess } from './business-access.service';

/**
 * ============================================================
 * @CurrentRestaurant(), alle info over het actieve restaurant
 * ============================================================
 *
 * Gebruik:
 *   @Get('summary')
 *   getSummary(@CurrentRestaurant() ctx: BusinessAccess) {
 *     console.log(ctx.businessId, ctx.role, ctx.permissions);
 *     ...
 *   }
 *
 * Voorwaarde:
 *   De BusinessAccessGuard moet hebben gedraaid. Die zet
 *   req.restaurant. Zonder die guard is er geen data en geeft
 *   deze decorator undefined terug.
 */
export const CurrentRestaurant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BusinessAccess | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ restaurant?: BusinessAccess }>();
    return req.restaurant;
  },
);
