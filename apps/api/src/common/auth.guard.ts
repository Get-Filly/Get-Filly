import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * ============================================================
 * AuthGuard — de poortwachter van onze API
 * ============================================================
 *
 * Wat doet een "Guard"?
 *   Een class die in NestJS beslist of een request mag doorgaan naar
 *   de controller. Draait automatisch vóór elke controller-methode
 *   waarop hij is toegepast.
 *
 * Wat we doen bij elke request (stap voor stap):
 *   1. Is het endpoint gemarkeerd als @Public()? → direct doorlaten.
 *   2. Zoek de "Authorization" header.
 *   3. Die moet het formaat "Bearer <token>" hebben.
 *   4. Verifieer het token met Supabase's publieke sleutels.
 *      - Klopt de handtekening? (écht door Supabase uitgegeven?)
 *      - Is hij niet verlopen?
 *   5. Zo ja: zet user-info op req.user, request mag door.
 *   6. Bij elke fout: gooi 401 Unauthorized.
 *
 * Hoe verifiëren we de handtekening?
 *   Supabase gebruikt tegenwoordig ES256 (asymmetric signing). Dat
 *   betekent: Supabase tekent tokens met een privé-sleutel, en wij
 *   verifiëren met de bijbehorende publieke sleutel. We hoeven dus
 *   geen geheim in onze .env — we halen de publieke sleutels op van
 *   Supabase's JWKS-endpoint (een publieke URL).
 *
 *   createRemoteJWKSet() uit `jose` regelt dit automatisch:
 *   - haalt de sleutels op bij de eerste request
 *   - cachet ze (standaard 10 minuten)
 *   - roteert automatisch als Supabase nieuwe keys publiceert
 *   - ondersteunt ES256, RS256, HS256 — het juiste algoritme volgt
 *     uit het token zelf
 */
@Injectable()
export class AuthGuard implements CanActivate {
  // De URL waar Supabase de publieke sleutels publiceert.
  // JWKS = "JSON Web Key Set" — een gestandaardiseerd formaat.
  private readonly jwksUrl: URL;

  // Functie die een publieke sleutel levert voor een gegeven token.
  // `jose` zorgt zelf voor caching + key-rotation.
  private readonly getKey: ReturnType<typeof createRemoteJWKSet>;

  // Voor multi-tenant: de verwachte "issuer" van tokens — dat is onze
  // Supabase project-URL. Zo weten we dat het token niet van een
  // ander project komt.
  private readonly expectedIssuer: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    const supabaseUrl = config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error(
        'SUPABASE_URL ontbreekt in .env — nodig om JWT-tokens te verifiëren.',
      );
    }

    // Supabase publiceert z'n publieke sleutels hier.
    // Voorbeeld: https://xxx.supabase.co/auth/v1/.well-known/jwks.json
    this.jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
    this.getKey = createRemoteJWKSet(this.jwksUrl);

    // Supabase zet in het token: "iss": "https://xxx.supabase.co/auth/v1"
    this.expectedIssuer = new URL('/auth/v1', supabaseUrl).toString();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // -------- Stap 1: endpoints met @Public() mogen overal door --------
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // -------- Stap 2: haal de Authorization-header op --------
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
      // Het rauwe Bearer-token bewaren we ook op het request-object.
      // Reden: de `RequestSupabaseService` (Scope.REQUEST) leest dit
      // straks om een per-request Supabase-client te bouwen die als
      // de ingelogde user opereert (RLS-policies pakken dan auth.uid()).
      accessToken?: string;
    }>();

    const rawHeader = req.headers['authorization'];
    const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!authHeader) {
      throw new UnauthorizedException('Geen Authorization header aanwezig.');
    }

    // -------- Stap 3: header moet "Bearer <token>" zijn --------
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Authorization header moet formaat "Bearer <token>" hebben.',
      );
    }

    // -------- Stap 4: verifieer het token --------
    // jwtVerify() doet alles in één aanroep:
    //   - decodeert het token
    //   - haalt de juiste publieke sleutel op via this.getKey
    //   - controleert de handtekening
    //   - controleert exp/nbf (verlopen/nog-niet-geldig)
    //   - controleert issuer (optioneel)
    // Gooit een error bij elke fout.
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.getKey, {
        issuer: this.expectedIssuer,
      });
      payload = result.payload;
    } catch (err) {
      // In development helpt het om de exacte reden te zien. In productie
      // kunnen we dit later omzetten naar stille logging.
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[AuthGuard] JWT verify failed:', msg);
      throw new UnauthorizedException('Ongeldig of verlopen token.');
    }

    // -------- Stap 5: user-id + email uit payload halen --------
    if (!payload.sub) {
      throw new UnauthorizedException('Token mist user-id (sub).');
    }

    // Supabase stopt het e-mailadres in "email" — we halen het eruit
    // als string. Als het ontbreekt (zou niet moeten), zetten we null.
    const email =
      typeof payload.email === 'string' ? payload.email : null;

    req.user = {
      id: payload.sub,
      email,
    };

    // Bewaar het rauwe token zodat de RequestSupabaseService er straks
    // bij kan om een per-request user-scoped client te bouwen. Het
    // token is op dit punt al geverifieerd — we vertrouwen het.
    req.accessToken = token;

    return true;
  }
}
