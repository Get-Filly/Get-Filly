import { InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * Logt de rauwe DB-/Postgres-foutmelding server-side en gooit een GENERIEKE
 * NL-melding naar de client. Zo lekken we nooit interne Postgres-details
 * (kolomnamen, constraints, RLS-policy-teksten) naar de browser, terwijl we
 * voor support/debugging de echte oorzaak wél in de logs houden.
 *
 * Return-type `never`: de helper gooit altijd, dus caller-control-flow
 * (`if (error) throwDbError(...)`) blijft kloppen voor TypeScript.
 */
export function throwDbError(
  logger: Logger,
  error: { message?: string } | null | undefined,
  userMessage = 'Er ging iets mis. Probeer het opnieuw.',
): never {
  logger.error(`DB-fout: ${error?.message ?? 'onbekend'}`);
  throw new InternalServerErrorException(userMessage);
}
