import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { RestaurantAccess } from './restaurant-access.service';

// ============================================================
// AiRateLimitGuard — beschermt AI-endpoints tegen runaway-kosten
// ============================================================
//
// Draait PAS NA de AuthGuard + RestaurantAccessGuard zodat
// req.restaurant gevuld is. Telt hoeveel Claude-calls dit
// restaurant het laatste uur heeft gedaan (via de ai_usage-tabel)
// en gooit 429 als het plafond is bereikt.
//
// Why een DB-query in plaats van in-memory counter:
//   - Overleeft api-restarts (geen reset van limiet bij deploy)
//   - Werkt correct over meerdere api-instances (later op Railway)
//   - Gebruikt de bestaande index ai_usage_restaurant_time_idx
//   - Kost één extra round-trip per call (~5ms); verwaarloosbaar
//     vergeleken met de Claude-call zelf (1-5 seconden)
//
// De limiet (100 per uur per restaurant) is bewust ruim voor echte
// gebruikers maar dood voor scripts. Straks, bij billing:
// per plan andere limieten (Starter 50/u, Pro 200/u, Enterprise
// bv. 1000/u). Voor nu één vaste waarde — die hangt aan de env-var
// AI_HOURLY_LIMIT_PER_RESTAURANT zodat we 'm per deploy kunnen
// tunen zonder code-deploy.
// ============================================================

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AiRateLimitGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      restaurant?: RestaurantAccess;
    }>();

    if (!req.restaurant) {
      throw new InternalServerErrorException(
        'AiRateLimitGuard draait zonder RestaurantAccessGuard — developer-fout.',
      );
    }

    const restaurantId = req.restaurant.restaurantId;
    const limit = Number(process.env.AI_HOURLY_LIMIT_PER_RESTAURANT ?? 100);
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // head:true + count:'exact' → geen rijen heen-en-weer, alleen een
    // HEAD-request met count in de response-headers. Zuinige query.
    const { count, error } = await this.supabase.client
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', sinceIso);

    if (error) {
      this.logger.error(`Rate-limit query faalde: ${error.message}`);
      // Bij DB-fout NIET fail-open (dat zou de kost-bescherming
      // uitzetten) maar ook niet fail-closed (dan is één DB-hikje
      // dat al je klanten blokkeert). We gooien een 503 zodat de
      // frontend de user een heldere "probeer zo opnieuw"-melding
      // geeft, en logging trekt de aandacht.
      throw new HttpException(
        'Kon AI-limiet niet controleren. Probeer het zo opnieuw.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const used = count ?? 0;
    if (used >= limit) {
      throw new HttpException(
        {
          message: `Filly-limiet bereikt: ${limit} verzoeken per uur. Probeer het straks opnieuw.`,
          limit,
          used,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
