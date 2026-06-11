import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildAuthorizeUrl } from "@/lib/meta-oauth";
import { logger } from "@/lib/logger";

/**
 * ============================================================
 * GET /oauth/meta/start, begin de Meta-koppeling
 * ============================================================
 *
 * De "Verbind Facebook/Instagram"-knop linkt hierheen (optioneel
 * met ?restaurantId=<id> om te weten welke zaak we koppelen). Deze
 * route:
 *   1. Checkt server-side dat er een ingelogde eigenaar is. Anders
 *      → /login, daarna terug hierheen.
 *   2. Genereert een CSRF-`state` en bewaart die in een httpOnly
 *      cookie. Meta echoot 'm terug in de callback; daar vergelijken
 *      we cookie vs. query-param.
 *   3. Bewaart het restaurant-id (indien meegegeven) in een aparte
 *      cookie i.p.v. in `state`, zodat het id niet in de URL naar
 *      Meta lekt. Stap 3 (token-opslag) hangt de token straks aan
 *      dit id.
 *   4. Redirect naar de Meta-toestemmingsdialog.
 *
 * Middleware blokkeert /oauth/* niet (alleen /dashboard + /onboarding),
 * dus deze route is bereikbaar; de auth-check hieronder doen we zelf.
 */

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  // 1. Alleen ingelogde eigenaars mogen een koppeling starten.
  //    Zelfde Supabase-SSR-patroon als /auth/confirm (cookie-based).
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // We lezen hier alleen de sessie; niets wegschrijven.
        setAll() {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", "/oauth/meta/start");
    return NextResponse.redirect(login);
  }

  // 2. CSRF-state. crypto is globaal beschikbaar in de Node-runtime.
  const state = crypto.randomUUID();

  // 3. Welke zaak koppelen we? (optioneel meegegeven door de knop)
  const restaurantId = searchParams.get("restaurantId") ?? "";

  // 4. Authorize-URL bouwen. Faalt dit (bv. META_APP_ID ontbreekt in
  //    de omgeving), dan geen harde 500 maar netjes terug naar de
  //    koppelingen-tab met een duidelijke reden.
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl({ origin, state });
  } catch (err) {
    logger.error("[meta-oauth] start faalde (config ontbreekt?):", err);
    const back = new URL("/dashboard/account?tab=koppelingen", origin);
    back.searchParams.set("meta", "error");
    back.searchParams.set("reason", "config");
    return NextResponse.redirect(back);
  }

  // 5. Redirect naar Meta + onze eenmalige cookies meegeven.
  const response = NextResponse.redirect(authorizeUrl);

  const cookieBase = {
    httpOnly: true,
    // Lokaal draait dit over http → dan geen secure-flag, anders
    // stuurt de browser de cookie niet mee.
    secure: origin.startsWith("https://"),
    // Lax = wél meegestuurd bij de top-level GET-redirect terug vanaf
    // facebook.com (precies wat OAuth-state nodig heeft).
    sameSite: "lax" as const,
    // Beperkt tot de callback-subtree zodat de cookie niet site-breed lekt.
    path: "/oauth/meta",
    // 10 min: ruim genoeg om de Meta-dialog af te ronden.
    maxAge: 600,
  };
  response.cookies.set("meta_oauth_state", state, cookieBase);
  if (restaurantId) {
    response.cookies.set("meta_oauth_rid", restaurantId, cookieBase);
  }
  return response;
}
