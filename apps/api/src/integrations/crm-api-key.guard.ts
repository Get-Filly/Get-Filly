import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

// ============================================================
// CrmApiKeyGuard — server-to-server beveiliging voor de CRM-koppeling
// ============================================================
// Onze gewone AuthGuard verwacht een Supabase-user-JWT. De CRM-koppeling
// is GEEN ingelogde gebruiker maar een vertrouwde backend-naar-backend-
// call. Die beveiligen we daarom met een gedeelde geheime sleutel
// (CRM_INTEGRATION_API_KEY) in plaats van een user-token.
//
// Het CRM stuurt mee:  Authorization: Bearer <sleutel>
// Wij vergelijken die met onze env-sleutel in CONSTANTE tijd, zodat een
// aanvaller de sleutel niet via timing-verschillen kan raden.
@Injectable()
export class CrmApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(CrmApiKeyGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CRM_INTEGRATION_API_KEY')?.trim();

    // Geen sleutel geconfigureerd = koppeling staat (nog) niet aan →
    // weiger alles. Veiliger dan per ongeluk een open endpoint.
    if (!expected) {
      this.logger.error(
        'CRM_INTEGRATION_API_KEY ontbreekt in de env — CRM-endpoint geweigerd.',
      );
      throw new UnauthorizedException('CRM-koppeling is niet geconfigureerd.');
    }

    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const provided = header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';

    if (!provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Ongeldige of ontbrekende API-sleutel.');
    }

    return true;
  }

  // Constante-tijd-vergelijking. We hashen beide eerst naar 32 bytes,
  // zodat timingSafeEqual altijd gelijke lengtes krijgt (anders gooit 'ie)
  // én de lengte van de sleutel niet uitlekt via de vergelijking.
  private safeEqual(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  }
}
