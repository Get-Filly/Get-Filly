// ============================================================
// auth-errors — Supabase-auth-fouten → NL/EN-microcopy-key
// ============================================================
//
// Supabase geeft z'n auth-fouten in het Engels terug ("Invalid login
// credentials"). Die rauwe tekst aan een Nederlandse eigenaar tonen
// leest onaf en onprofessioneel. Deze pure mapper vertaalt de fout
// naar een stabiele key; de pagina rendert 'm via next-intl
// (`auth.errors.<key>` in messages/{nl,en}.json).
//
// Bewust een KEY i.p.v. directe tekst: zo blijft de copy in de
// messages-bestanden (één plek, beide talen) en blijft deze functie
// puur + makkelijk te unit-testen.
//
// Matching-volgorde: eerst de stabiele `code` (Supabase JS v2), dan
// een message-substring als fallback (oudere SDK's / edge-cases), dan
// HTTP-status. Onbekend → 'generic'.

export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "generic";

// We typen losjes: elke fout met optionele code/status/message past.
// Zo hoeven we de Supabase-AuthError-type niet te importeren en werkt
// het ook met een gewone Error of null.
type MaybeAuthError = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
} | null | undefined;

export function authErrorKey(error: MaybeAuthError): AuthErrorKey {
  if (!error) return "generic";

  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "invalidCredentials";
  }
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) {
    return "emailNotConfirmed";
  }
  if (
    error.status === 429 ||
    code.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many")
  ) {
    return "rateLimited";
  }
  return "generic";
}
