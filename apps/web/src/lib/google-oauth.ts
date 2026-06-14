import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ============================================================
// Google Bedrijfsprofiel OAuth, "beheren namens de zaak"
// ============================================================
// Gedeelde config + helpers voor de twee route-handlers:
//   - /oauth/google/start    -> stuurt de eigenaar naar Google's consent
//   - /oauth/google/callback -> valideert de getekende state en stuurt
//                              de `code` door naar de Nest-API, die de
//                              token-exchange + versleutelde opslag doet
//
// Verschil met Meta: de tenant-id zit NIET in een losse cookie maar in
// een CRYPTOGRAFISCH GETEKENDE state (HMAC-SHA256). De state:
//   - draagt het restaurant-id mee (callback weet welke zaak),
//   - is ondertekend (knoeien breekt de handtekening),
//   - verloopt na STATE_TTL_MS,
//   - bevat een nonce die ook in een httpOnly-cookie staat -> double
//     submit tegen login-CSRF.
//
// LET OP: redirect_uri MOET byte-voor-byte gelijk zijn op alle plekken:
// deze code, de authorize-stap, de token-stap (API) EN "Geautoriseerde
// omleidings-URI's" in Google Cloud Console. Een afwijking (http/https,
// www/apex, trailing slash) -> Google weigert met redirect_uri_mismatch.
// ============================================================

// Eén scope: beheer van het Google Bedrijfsprofiel namens de zaak.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
] as const;

// Geldigheidsduur van de state (10 min, ruim voor de consent-dialog).
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleRedirectUri(origin: string): string {
  return `${origin}/oauth/google/callback`;
}

// client_id is niet geheim (gaat als param mee in de URL). Het SECRET
// leeft alleen in de API. Hier server-side lezen zodat alle Google-
// config op één plek staat.
export function googleClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_OAUTH_CLIENT_ID ontbreekt in de omgeving");
  return id;
}

function stateSecret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error("OAUTH_STATE_SECRET ontbreekt in de omgeving");
  return s;
}

type StatePayload = { rid: string; nonce: string; iat: number };

// Tekent een state: base64url(payload).base64url(hmac). De nonce komt
// ook in een cookie (zie start-route) zodat de callback kan checken dat
// dezelfde browser de flow startte.
export function signState(restaurantId: string): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const payload: StatePayload = { rid: restaurantId, nonce, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  return { state: `${body}.${sig}`, nonce };
}

// Verifieert handtekening + verloop. Geeft de payload terug, of null bij
// ongeldige/verlopen/geknoeide state. De nonce-vs-cookie-check doet de
// callback zelf (die heeft de cookie).
export function verifyState(state: string): StatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Timing-safe vergelijking tegen signature-oracle-aanvallen.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as StatePayload;
  } catch {
    return null;
  }
  if (!payload?.rid || !payload?.nonce || typeof payload.iat !== "number") {
    return null;
  }
  if (Date.now() - payload.iat > STATE_TTL_MS) return null; // verlopen
  return payload;
}

// Bouwt de Google-consent-URL. access_type=offline + prompt=consent ->
// Google geeft ELKE keer een refresh_token terug (zonder prompt=consent
// alleen de allereerste keer per gebruiker).
export function buildAuthorizeUrl({
  origin,
  state,
}: {
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
