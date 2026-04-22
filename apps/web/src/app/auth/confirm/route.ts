import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * ============================================================
 * GET /auth/confirm — server-side OTP-verificatie
 * ============================================================
 *
 * Dit is de *enige* plek waar we Supabase-magic-links afhandelen.
 * Supabase stuurt (via de e-mail-template die wij in het Dashboard
 * zetten) links van de vorm:
 *
 *   /auth/confirm?token_hash=<hash>&type=invite&next=/invite/accept?inv=<ourToken>
 *
 * Hier gebeurt:
 *   1. Parameters uitlezen en valideren (geen open-redirect,
 *      alleen bekende OTP-types).
 *   2. Supabase server-client opzetten met cookies uit het verzoek.
 *   3. `verifyOtp({ token_hash, type })` omwisselt de éénmalige hash
 *      voor een échte sessie; Supabase schrijft die in onze cookies.
 *   4. Doorgeredirect naar `next` — of bij fout naar dezelfde
 *      `next` mét een `auth_error`-param zodat de bestemmingspagina
 *      een nette melding kan tonen.
 *
 * Waarom deze route bestaat:
 *   - `@supabase/ssr` werkt met cookies, niet met hash-tokens in de URL.
 *     Zonder deze route blijft de sessie leeg en faalt /invite/accept.
 *   - Tokens belanden hier nooit in de browser-history van de user:
 *     de verify gebeurt server-side en de redirect daarna bevat geen
 *     token meer.
 *   - Hetzelfde patroon werkt straks voor signup-confirm,
 *     magic-link-login en password-reset. Eén fundament voor alles.
 */

// Welke OTP-types accepteren we? Alleen die we daadwerkelijk
// ondersteunen — zo kan iemand met een geknutselde URL geen
// onbedoelde flow triggeren.
const ALLOWED_TYPES = new Set<EmailOtpType>([
  "invite",
  "magiclink",
  "signup",
  "recovery",
  "email_change",
]);

// Valideer `next` streng: alleen paden op ons eigen domein.
// Zonder deze check kan iemand een link sturen met
// `next=https://phishing.com` en de user na verify daarheen sturen
// (open-redirect).
//
// We accepteren twee vormen:
//   1. Relatieve paden zoals `/invite/accept?inv=abc`
//   2. Absolute URLs die naar dezelfde origin wijzen als het
//      inkomende verzoek — Supabase geeft namelijk `{{ .RedirectTo }}`
//      als absolute URL door aan onze template.
//
// Alles wat naar een andere host wijst of niet goed parseert →
// returnt null → callsite valt terug op een veilige default.
function parseSafeNext(
  rawNext: string | null,
  origin: string,
): string | null {
  if (!rawNext) return null;
  try {
    // `new URL(next, origin)` parsed relatieve paden tegen onze
    // eigen origin, en absolute URLs tegen zichzelf. Beide eindigen
    // in een volledig URL-object waarvan we de origin kunnen checken.
    const parsed = new URL(rawNext, origin);
    if (parsed.origin !== origin) return null; // cross-origin → blok
    return parsed.pathname + parsed.search;
  } catch {
    // Ongeldige URL-vorm — weigeren.
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const nextParam = searchParams.get("next");

  // Veilige default als `next` ontbreekt of niet te vertrouwen is.
  const safeNext = parseSafeNext(nextParam, origin) ?? "/dashboard";

  // Validatie — we loggen bewust NIETS van de token_hash.
  // Loggen van de volledige URL (zoals Next.js/Vercel default doet)
  // kan tokens blootstellen aan iedereen met log-toegang.
  if (!token_hash) {
    return NextResponse.redirect(
      new URL(`${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=missing_token`, origin),
    );
  }
  if (!typeParam || !ALLOWED_TYPES.has(typeParam as EmailOtpType)) {
    return NextResponse.redirect(
      new URL(`${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=invalid_type`, origin),
    );
  }
  const type = typeParam as EmailOtpType;

  // Supabase SSR-client: leest cookies uit het huidige verzoek en
  // mag ze via `setAll` wegschrijven op de response. Het response-
  // object wordt verderop vervangen door een redirect; cookies die
  // we hier settelen moeten we dáár opnieuw meegeven.
  const cookieStore = await cookies();
  let cookiesToSet: { name: string; value: string; options: object }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(all) {
          // Onthoud de cookies — we zetten ze straks op de redirect-response.
          cookiesToSet = all;
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    // Mogelijke oorzaken: token verlopen, al gebruikt, of ongeldig.
    // De bestemmingspagina beslist wat voor UI ze toont — wij
    // geven alleen een reden mee.
    const reason =
      error.message.toLowerCase().includes("expired")
        ? "expired"
        : error.message.toLowerCase().includes("already")
          ? "already_used"
          : "verify_failed";

    const errorUrl = new URL(
      `${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${reason}`,
      origin,
    );
    return NextResponse.redirect(errorUrl);
  }

  // Succes — cookies die Supabase heeft gezet op de response meegeven.
  const response = NextResponse.redirect(new URL(safeNext, origin));
  for (const c of cookiesToSet) {
    response.cookies.set(c.name, c.value, c.options);
  }
  return response;
}
