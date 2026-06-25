/**
 * ============================================================
 * Copy-length-guard — lengte-naleving afdwingen ná generatie
 * ============================================================
 *
 * Het brein (filly-brain.config) zet de lengte-bandbreedte per kanaal
 * in elke prompt, maar een LLM houdt zich daar nooit 100% aan. Deze
 * guard is de deterministische controle achteraf: valt een variant
 * buiten CHANNEL_RULES[channel].copyLength, dan volgt één gerichte
 * herschrijf-poging met expliciete teken-aantallen. Daarna accepteren
 * we het beste resultaat en loggen we een warning — een te lange
 * tekst mag de eigenaar nooit blokkeren, wel signaleren we het zodat
 * we structurele uitschieters in de logs zien.
 *
 * Kosten: de retry hergebruikt dezelfde system-prompt; bij callers
 * met cacheSystem=true betaalt de tweede call dus ~10% van de
 * input-tokens (Anthropic prompt-caching, 5 min TTL).
 */

import { Logger } from '@nestjs/common';
import {
  CHANNEL_RULES,
  checkCopyLength,
  type FillyChannel,
} from './filly-brain.config';

export type LengthViolation = {
  /** Index in de aangeleverde bodies-array (0-based). */
  index: number;
  chars: number;
  verdict: 'too_short' | 'too_long';
  minChars: number;
  maxChars: number;
};

/** Welke bodies vallen buiten de bandbreedte van dit kanaal? */
export function findLengthViolations(
  channel: FillyChannel,
  bodies: string[],
): LengthViolation[] {
  const violations: LengthViolation[] = [];
  bodies.forEach((body, index) => {
    const check = checkCopyLength(channel, body);
    if (!check.ok) {
      violations.push({
        index,
        chars: check.chars,
        verdict: check.verdict as 'too_short' | 'too_long',
        minChars: check.minChars,
        maxChars: check.maxChars,
      });
    }
  });
  return violations;
}

/**
 * Correctie-instructie voor de retry-prompt. Benoemt per variant
 * het gemeten aantal tekens en de overschreden grens — concreter
 * dan "korter graag" en daardoor veel betrouwbaarder.
 */
export function buildLengthRetryInstruction(
  channel: FillyChannel,
  violations: LengthViolation[],
): string {
  const { minChars, maxChars } = CHANNEL_RULES[channel].copyLength;
  const detail = violations
    .map(
      (v) =>
        `variant ${v.index + 1} was ${v.chars} tekens (${
          v.verdict === 'too_long'
            ? `maximum is ${v.maxChars}`
            : `minimum is ${v.minChars}`
        })`,
    )
    .join(', ');
  return `LET OP — LENGTE-CORRECTIE: bij de vorige poging viel de tekst buiten de kanaal-bandbreedte: ${detail}. Lever alle varianten opnieuw en houd élke body strikt tussen ${minChars} en ${maxChars} tekens. Te lang inkorten = zinnen schrappen, niet alleen losse woorden.`;
}

/**
 * Generieke enforce-flow: check → max 1 gerichte herschrijf → beste
 * resultaat accepteren. `regenerate` krijgt de correctie-instructie
 * en hoort dezelfde AI-call te herhalen met die instructie achter de
 * user-prompt geplakt.
 */
export async function enforceCopyLength<T>(opts: {
  channel: FillyChannel;
  first: T;
  getBodies: (result: T) => string[];
  regenerate: (retryInstruction: string) => Promise<T>;
  logger: Logger;
  feature: string;
}): Promise<T> {
  const firstViolations = findLengthViolations(
    opts.channel,
    opts.getBodies(opts.first),
  );
  if (firstViolations.length === 0) return opts.first;

  opts.logger.warn(
    `[${opts.feature}] ${firstViolations.length} tekst(en) buiten de ${opts.channel}-bandbreedte: ${firstViolations
      .map(
        (v) =>
          `#${v.index + 1} ${v.chars} tekens (${v.verdict === 'too_long' ? `max ${v.maxChars}` : `min ${v.minChars}`})`,
      )
      .join(', ')}. Eén gerichte herschrijf-poging.`,
  );

  let second: T;
  try {
    second = await opts.regenerate(
      buildLengthRetryInstruction(opts.channel, firstViolations),
    );
  } catch (err) {
    // De retry is best-effort: een fout hier mag het oorspronkelijke
    // (werkende) resultaat nooit wegnemen.
    opts.logger.warn(
      `[${opts.feature}] lengte-herschrijf mislukt (${String(err)}); eerste resultaat geaccepteerd.`,
    );
    return opts.first;
  }

  // Een herschrijf die INHOUD kwijtraakt (lege bodies of minder varianten)
  // mag het werkende eerste resultaat nooit vervangen. Een lege set heeft
  // namelijk 0 lengte-overtredingen en zou anders "winnen" van een prima
  // eerste poging — wat de caller met 0 bruikbare teksten + een onterechte
  // "geen bruikbare versies"-fout opzadelt.
  const countUsable = (r: T) =>
    opts
      .getBodies(r)
      .filter((b) => typeof b === 'string' && b.trim().length > 0).length;
  if (countUsable(second) < countUsable(opts.first)) {
    opts.logger.warn(
      `[${opts.feature}] herschrijf leverde minder bruikbare teksten dan de eerste poging; eerste resultaat geaccepteerd.`,
    );
    return opts.first;
  }

  const secondViolations = findLengthViolations(
    opts.channel,
    opts.getBodies(second),
  );
  if (secondViolations.length > 0) {
    opts.logger.warn(
      `[${opts.feature}] na herschrijf nog ${secondViolations.length} buiten de band; beste van de twee pogingen geaccepteerd.`,
    );
  }
  return secondViolations.length <= firstViolations.length
    ? second
    : opts.first;
}
