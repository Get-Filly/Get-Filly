import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// RateLimitGuard — een rem per IP of per user
// ============================================================
//
// Waarom in de database en niet in het geheugen: op Vercel is elke request
// een mogelijk verse functie-instantie, dus een Map in het geheugen telt
// vrijwel niets. Dezelfde reden waarom AiRateLimitGuard al op ai_usage telt.
// Hier gaat het via check_rate_limit() (mig 0076), die optellen en checken
// in één atomaire statement doet.
//
// Waar dit voor is: publieke endpoints die per aanroep geld kosten. Het
// contactformulier stuurt een mail (Resend) en de onboarding-analyse belt
// Claude. Zonder rem kan iemand daar ongelimiteerd op rammen.
//
// Wat dit NIET is: bescherming tegen een gedistribueerde aanval. Een botnet
// met duizend IP's loopt hier gewoon omheen. Daarvoor is een WAF nodig
// (Vercel Firewall); dit is de goedkope eerste lijn die het meest
// voorkomende geval afvangt, één bron die doorramt.

export type RateLimitOptions = {
  /** Naam van de teller, bv. 'contact'. Scheidt endpoints van elkaar. */
  bucket: string;
  /** Maximaal aantal aanroepen per venster. */
  limit: number;
  /** Lengte van het venster in seconden. */
  windowSeconds: number;
  /**
   * Waarop we tellen. 'ip' voor publieke endpoints, 'user' als er al een
   * ingelogde gebruiker is (nauwkeuriger: een IP kan gedeeld zijn).
   */
  keyBy?: 'ip' | 'user';
};

export const RATE_LIMIT_KEY = 'rateLimit';

/** Hang een rem op een endpoint. Zie RateLimitOptions. */
export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private saltWarned = false;

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Geen @RateLimit op dit endpoint? Dan doet deze guard niets.
    if (!opts) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
      user?: { id?: string };
    }>();

    const key =
      opts.keyBy === 'user'
        ? (req.user?.id ?? this.clientKey(req))
        : this.clientKey(req);

    // De typering van .rpc() is los (het schema is niet gegenereerd), dus
    // het resultaat expliciet vastleggen op wat de functie belooft: een
    // boolean, of een fout.
    const { data, error } = (await this.supabase.client.rpc(
      'check_rate_limit',
      {
        p_bucket: opts.bucket,
        p_key: key,
        p_limit: opts.limit,
        p_window_seconds: opts.windowSeconds,
      },
    )) as { data: boolean | null; error: { message: string } | null };

    if (error) {
      // Bewust fail-OPEN, en dat is hier de juiste kant. Deze guard hangt op
      // het contactformulier en de onboarding: gaat de teller stuk, dan is
      // een klant die geen contact kan opnemen erger dan een uur zonder rem.
      // (Bij de webhook-signature koos het project fail-closed — daar gaat
      // het om authenticiteit, niet om kosten.)
      this.logger.error(
        `Rate-limit-check faalde (${opts.bucket}), verzoek doorgelaten: ${error.message}`,
      );
      return true;
    }

    if (data === false) {
      this.logger.warn(`Rate-limit bereikt op ${opts.bucket}.`);
      throw new HttpException(
        {
          message:
            'Te veel verzoeken achter elkaar. Probeer het over een paar minuten opnieuw.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /**
   * Een sleutel per client, afgeleid van het IP. Bewust gehasht: een IP is
   * een persoonsgegeven, en voor een teller hebben we het rauwe adres niet
   * nodig. Met een salt, want een kale sha256 over de IPv4-ruimte is
   * triviaal terug te rekenen.
   */
  private clientKey(req: {
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string {
    // Achter Vercel staat het echte adres in x-forwarded-for; de eerste
    // waarde is de client, de rest zijn proxies.
    const fwd = req.headers['x-forwarded-for'];
    const raw =
      (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'onbekend';

    const salt = process.env.RATE_LIMIT_SALT ?? process.env.CRON_SECRET ?? '';
    if (!salt && !this.saltWarned) {
      this.saltWarned = true;
      this.logger.warn(
        'Geen RATE_LIMIT_SALT of CRON_SECRET: IP-hashes zijn dan terug te rekenen.',
      );
    }
    return createHash('sha256').update(`${salt}:${raw}`).digest('hex');
  }
}
