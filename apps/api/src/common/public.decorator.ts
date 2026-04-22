import { SetMetadata } from '@nestjs/common';

/**
 * ============================================================
 * @Public() — markering voor endpoints zonder login-check
 * ============================================================
 *
 * Wat is een "decorator"?
 *   In TypeScript/NestJS is een decorator een functie die je boven
 *   een class, methode of parameter zet met een @-teken. Het voegt
 *   extra informatie (metadata) of gedrag toe aan dat ding.
 *
 * Waarom deze decorator bestaat:
 *   Straks zetten we een globale AuthGuard aan die op álle requests
 *   controleert of er een geldige login is. Maar sommige endpoints
 *   moeten bereikbaar zijn zónder login — bijvoorbeeld een
 *   health-check die door monitoring-tools wordt gepingd, of een
 *   publiek statusendpoint.
 *
 * Hoe gebruik je het:
 *   Zet @Public() boven een controller-methode:
 *
 *     @Public()
 *     @Get('health')
 *     getHealth() { return { status: 'ok' }; }
 *
 *   De AuthGuard checkt bij elke request of deze markering aanwezig
 *   is. Zo ja: request mag door zonder login-token.
 *
 * Technisch:
 *   SetMetadata slaat een sleutel/waarde-paar op bij de methode.
 *   De AuthGuard leest die metadata later via de Reflector.
 *
 * IS_PUBLIC_KEY is de sleutel waaronder we de markering opslaan —
 * moet dezelfde zijn als de key die de guard gebruikt om te lezen.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
