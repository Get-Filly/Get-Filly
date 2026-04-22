import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * ============================================================
 * JwtPayload — wat zit er in een Supabase JWT-token?
 * ============================================================
 * Wanneer een user inlogt via Supabase Auth krijgt de frontend
 * een "JWT" terug (JSON Web Token). Dat token ziet eruit als een
 * lange tekst met puntjes erin en bevat (versleuteld onderteken)
 * gegevens over de user. De belangrijkste velden voor ons:
 *
 *   - sub:   subject → de user-id (dit is wat we echt nodig hebben)
 *   - email: e-mailadres van de user
 *   - aud:   audience → bij Supabase normaal "authenticated"
 *   - exp:   expiration → tijdstip waarop het token ongeldig wordt
 */
type JwtPayload = {
  sub?: string;
  email?: string;
  aud?: string;
  exp?: number;
};

/**
 * ============================================================
 * AuthGuard — de poortwachter van onze API
 * ============================================================
 *
 * Een "Guard" in NestJS is een class die beslist of een request
 * mag doorgaan naar de controller. Hij wordt automatisch uitgevoerd
 * vóórdat de controller-methode draait.
 *
 * Wat deze guard doet (stap voor stap):
 *   1. Is het endpoint gemarkeerd als @Public()? → direct toestaan
 *   2. Zoek de "Authorization" header op de request.
 *   3. Die header moet beginnen met "Bearer " gevolgd door het token.
 *   4. Verifieer het token met het JWT-secret uit Supabase.
 *      - Klopt de handtekening? (anders: iemand heeft 'm verzonnen)
 *      - Is hij niet verlopen?
 *   5. Als alles klopt: zet user-info op req.user, request gaat door.
 *   6. Bij één fout: gooi 401 Unauthorized.
 *
 * Hoe we 'm straks aanzetten:
 *   In app.module.ts registreren we deze guard als "APP_GUARD"
 *   (globale guard). Dan draait hij op elke request automatisch,
 *   tenzij @Public() is gezet.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    // Lees het Supabase JWT-secret uit .env. Zonder dit kunnen we
    // geen tokens verifiëren — dus we crashen hard als het ontbreekt.
    const secret = config.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new Error(
        'SUPABASE_JWT_SECRET ontbreekt in .env. ' +
          'Haal hem op uit Supabase Project Settings → API → JWT Settings.',
      );
    }
    this.jwtSecret = secret;
  }

  /**
   * canActivate wordt door NestJS aangeroepen bij elke request die
   * door een @UseGuards of globaal-geregistreerde guard komt.
   *
   * Retourneer true  → request mag door naar de controller.
   * Retourneer false → request wordt geblokkeerd (403 standaard).
   * Gooi exception   → stuur een eigen error-response (wij gebruiken 401).
   */
  canActivate(context: ExecutionContext): boolean {
    // -------- Stap 1: endpoints met @Public() mogen overal door --------
    // Reflector kijkt naar de metadata die we met @Public() hebben gezet.
    // getAllAndOverride checkt zowel de methode als de class (class-niveau
    // markering werkt ook, bijvoorbeeld een hele Health-controller als
    // publiek markeren).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // -------- Stap 2: haal de Authorization-header op --------
    const req = context
      .switchToHttp()
      .getRequest<{
        headers: Record<string, string | string[] | undefined>;
        user?: AuthenticatedUser;
      }>();

    const rawHeader = req.headers['authorization'];
    const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!authHeader) {
      throw new UnauthorizedException('Geen Authorization header aanwezig.');
    }

    // -------- Stap 3: de header moet beginnen met "Bearer " --------
    // Dit is de afgesproken manier om JWT-tokens mee te sturen:
    //   Authorization: Bearer eyJhbGciOi...
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Authorization header moet formaat "Bearer <token>" hebben.',
      );
    }

    // -------- Stap 4: verifieer het token --------
    // jwt.verify() doet drie dingen tegelijk:
    //   a) decodeert het token
    //   b) controleert of de handtekening klopt met ons JWT-secret
    //      (dus: is dit token écht door Supabase uitgegeven?)
    //   c) controleert of het token niet verlopen is (exp-veld)
    // Als iets fout is, gooit het een error — die vangen we op.
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (err) {
      // We geven bewust een generieke foutmelding terug, zodat een
      // aanvaller niet weet of het token verlopen is, ongeldig, of iets
      // anders. Intern kunnen we later wel loggen wat er precies mis is.
      throw new UnauthorizedException('Ongeldig of verlopen token.');
    }

    // -------- Stap 5: haal user-id + email uit het token --------
    if (!payload.sub) {
      throw new UnauthorizedException('Token mist user-id (sub).');
    }

    // Zet de user op het request-object zodat @CurrentUser() en
    // @RestaurantId() straks weten wie er inlogd is.
    req.user = {
      id: payload.sub,
      email: payload.email ?? null,
    };

    // Alles gecheckt — request mag door.
    return true;
  }
}
