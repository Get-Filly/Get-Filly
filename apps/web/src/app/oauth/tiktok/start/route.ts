import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildAuthorizeUrl } from "@/lib/tiktok-oauth";
import { logger } from "@/lib/logger";

/**
 * ============================================================
 * GET /oauth/tiktok/start, begin de TikTok-koppeling
 * ============================================================
 *
 * Spiegelt /oauth/meta/start:
 *   1. Server-side check dat er een ingelogde eigenaar is (anders → /login).
 *   2. CSRF-`state` genereren + in httpOnly-cookie bewaren.
 *   3. Restaurant-id (indien meegegeven) in een aparte cookie, zodat het
 *      niet in de URL naar TikTok lekt; de token wordt straks aan dit id
 *      gehangen.
 *   4. Redirect naar TikTok's toestemmingsscherm.
 *
 * /oauth/* valt buiten de auth-middleware-matcher, dus de auth-check
 * hieronder doen we zelf.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

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
    login.searchParams.set("next", "/oauth/tiktok/start");
    return NextResponse.redirect(login);
  }

  const state = crypto.randomUUID();
  const restaurantId = searchParams.get("restaurantId") ?? "";

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl({ origin, state });
  } catch (err) {
    logger.error("[tiktok-oauth] start faalde (config ontbreekt?):", err);
    const back = new URL("/dashboard/account?tab=koppelingen", origin);
    back.searchParams.set("tiktok", "error");
    back.searchParams.set("reason", "config");
    return NextResponse.redirect(back);
  }

  const response = NextResponse.redirect(authorizeUrl);
  const cookieBase = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/oauth/tiktok",
    maxAge: 600,
  };
  response.cookies.set("tiktok_oauth_state", state, cookieBase);
  if (restaurantId) {
    response.cookies.set("tiktok_oauth_rid", restaurantId, cookieBase);
  }
  return response;
}
