import { createHash, timingSafeEqual } from 'crypto';

// ============================================================
// timingSafeBearer — constante-tijd-controle van een cron-secret
// ============================================================
// Vercel Cron stuurt `Authorization: Bearer <CRON_SECRET>`. We vergelijken
// die in CONSTANTE tijd met de verwachte secret: beide worden eerst naar
// 32 bytes gehasht (sha256) zodat timingSafeEqual altijd gelijke lengtes
// krijgt én de secret-lengte niet via timing-verschillen uitlekt. Een
// gewone `auth !== \`Bearer ${secret}\``-vergelijking is een timing-oracle.
//
// Returnt false bij een ontbrekende secret of header (= weigeren).
export function timingSafeBearer(
  authHeader: string | undefined | null,
  secret: string | undefined | null,
): boolean {
  if (!secret || !authHeader) return false;
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length);
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
