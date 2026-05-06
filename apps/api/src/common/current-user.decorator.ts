import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * ============================================================
 * Type: AuthenticatedUser
 * ============================================================
 * Beschrijft welke velden we van een ingelogde user hebben nadat
 * de AuthGuard zijn JWT heeft gecontroleerd. Dit is een subset
 * van wat Supabase in het token stopt, we nemen alleen wat we
 * echt nodig hebben.
 *
 *   - id:    de unieke gebruikers-id (uuid, dezelfde als in auth.users)
 *   - email: het e-mailadres waarmee is ingelogd
 */
export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/**
 * ============================================================
 * @CurrentUser(), haal de ingelogde user op in een controller
 * ============================================================
 *
 * Wat doet dit:
 *   Een "param decorator" zet je boven een parameter van een
 *   controller-methode. Bij elke request haalt NestJS dan automatisch
 *   de waarde op die deze decorator retourneert.
 *
 * Hoe je het gebruikt:
 *
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: AuthenticatedUser) {
 *     return { userId: user.id, email: user.email };
 *   }
 *
 * Hoe het werkt onder water:
 *   De AuthGuard heeft na zijn check de user-info op het request-object
 *   gezet (req.user = { id, email }). Deze decorator leest dat gewoon
 *   weer uit.
 *
 * Belangrijk:
 *   Dit werkt alleen als de AuthGuard eerder is gedraaid. Op een
 *   endpoint met @Public() bestaat req.user niet, dan krijg je
 *   undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    // Haal het onderliggende HTTP-request op (Express-request).
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    // Geeft terug wat de guard eerder heeft toegevoegd.
    return req.user;
  },
);
