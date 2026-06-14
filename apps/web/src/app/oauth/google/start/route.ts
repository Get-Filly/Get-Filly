import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildAuthorizeUrl, signState } from "@/lib/google-oauth";
import { logger } from "@/lib/logger";

// node:crypto in google-oauth.ts vereist de Node-runtime (geen Edge).
export const runtime = "nodejs";

/**
 * ============================================================
 * GET /oauth/google/start, begin de Google-Bedrijfsprofiel-koppeling
 * ============================================================
 *
 * De "Verbind Google"-knop linkt hierheen met ?restaurantId=<id>.
 *   1. Auth-check: alleen ingelogde eigenaars (anders -> /login).
 *   2. Teken een state die het restaurant-id + een nonce meedraagt.
 *   3. Zet de nonce in een httpOnly-cookie (double-submit-CSRF).
 *   4. Redirect naar Google's consent-scherm.
 *
 * Middleware blokkeert /oauth/* niet, dus deze route is bereikbaar;
 * de auth-check doen we hieronder zelf (zelfde patroon als Meta-start).
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  // Welke zaak koppelen we? Verplicht; zonder weten we straks niet aan
  // wie de tokens horen.
  const restaurantId = searchParams.get("restaurantId") ?? "";

  // 1. Ingelogde eigenaar vereist (zelfde SSR-patroon als Meta-start).
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", origin);
    login.searchParams.set(
      "next",
      `/oauth/google/start${restaurantId ? `?restaurantId=${restaurantId}` : ""}`,
    );
    return NextResponse.redirect(login);
  }

  // 2a. Zonder restaurant-id kunnen we de tokens nergens aan hangen.
  if (!restaurantId) {
    const back = new URL("/dashboard/account?tab=koppelingen", origin);
    back.searchParams.set("google", "error");
    back.searchParams.set("reason", "no_restaurant");
    return NextResponse.redirect(back);
  }

  // 2b + 3. State tekenen + authorize-URL bouwen. Faalt config (geen
  //         client-id of state-secret) -> nette terugleiding i.p.v. 500.
  let authorizeUrl: string;
  let nonce: string;
  try {
    const signed = signState(restaurantId);
    nonce = signed.nonce;
    authorizeUrl = buildAuthorizeUrl({ origin, state: signed.state });
  } catch (err) {
    logger.error("[google-oauth] start faalde (config ontbreekt?):", err);
    const back = new URL("/dashboard/account?tab=koppelingen", origin);
    back.searchParams.set("google", "error");
    back.searchParams.set("reason", "config");
    return NextResponse.redirect(back);
  }

  // 4. Redirect + nonce-cookie meegeven.
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("google_oauth_nonce", nonce, {
    httpOnly: true,
    // Lokaal http -> geen secure-flag, anders stuurt de browser 'm niet mee.
    secure: origin.startsWith("https://"),
    // Lax = wel meegestuurd bij de top-level GET-redirect terug van Google.
    sameSite: "lax",
    path: "/oauth/google",
    maxAge: 600,
  });
  return response;
}
