import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================
// Meta `signed_request` verifiëren
// ============================================================
// Meta stuurt z'n callbacks (deauthorize + data-deletion) met een
// `signed_request` in de body: "<sig>.<payload>", beide base64url.
// De handtekening is HMAC-SHA256 van de ENCODED payload-string, met
// het App Secret als sleutel. Klopt de handtekening niet, dan is het
// verzoek niet echt van Meta → afwijzen.

export type MetaSignedRequestPayload = {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
};

/**
 * Verifieert + decodeert een signed_request. Returnt de payload, of
 * `null` als het formaat of de handtekening niet klopt.
 */
export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequestPayload | null {
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;

  // Handtekening herberekenen over de ENCODED payload-string.
  const expected = createHmac('sha256', appSecret)
    .update(encodedPayload)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(encodedSig, 'base64url');
  } catch {
    return null;
  }

  // timingSafeEqual eist gelijke lengte; check die eerst (en
  // voorkomt zo ook timing-leaks via de lengte).
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as MetaSignedRequestPayload;
    // Meta gebruikt altijd HMAC-SHA256; iets anders vertrouwen we niet.
    if (
      payload.algorithm &&
      payload.algorithm.toUpperCase() !== 'HMAC-SHA256'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
