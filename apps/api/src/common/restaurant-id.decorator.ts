import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Demo-restaurant voor MVP zonder auth.
 * Wanneer auth erbij komt vervangen we deze fallback door logica die
 * de actieve restaurant-id afleidt uit de geauthenticeerde sessie.
 */
export const DEMO_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Leest de actieve restaurant-id uit de request:
 *   1. `X-Restaurant-Id` header (door frontend gezet)
 *   2. fallback: DEMO_RESTAURANT_ID
 *
 * Gebruik in controllers:
 *   @Get()
 *   getKpis(@RestaurantId() restaurantId: string) { ... }
 */
export const RestaurantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers['x-restaurant-id'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    return DEMO_RESTAURANT_ID;
  },
);
