import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================
// verifySvixSignature — Svix/Resend-webhook-signature controleren
// ============================================================
// Resend ondertekent webhooks via Svix. De ontvanger valideert met de
// signing-secret (RESEND_WEBHOOK_SECRET, formaat "whsec_<base64>") + drie
// headers: svix-id, svix-timestamp, svix-signature.
//
//   signedContent = `${id}.${timestamp}.${rawBody}`
//   verwacht      = base64( HMAC-SHA256( base64decode(secret), signedContent ) )
//
// De svix-signature-header is een spatie-gescheiden lijst van "v1,<base64>".
// We vergelijken in CONSTANTE tijd en weigeren bij een te oude timestamp
// (replay-bescherming, 5 min tolerantie). CRUCIAAL: `rawBody` moet exact de
// bytes zijn die Resend stuurde — daarom rawBody: true in de bootstrap, niet
// een opnieuw-geserialiseerde JSON.
export function verifySvixSignature(
  rawBody: string,
  headers: {
    id?: string | null;
    timestamp?: string | null;
    signature?: string | null;
  },
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Replay-bescherming: timestamp binnen 5 min van nu.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 5 * 60) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest();

  // Header kan meerdere handtekeningen bevatten ("v1,a v1,b"); accepteer als
  // er één matcht.
  for (const part of signature.split(' ')) {
    const comma = part.indexOf(',');
    if (comma < 0) continue;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== 'v1' || !sig) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    ) {
      return true;
    }
  }
  return false;
}
