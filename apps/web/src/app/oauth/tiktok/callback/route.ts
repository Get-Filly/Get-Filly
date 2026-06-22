import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { tiktokRedirectUri } from "@/lib/tiktok-oauth";
import { logger } from "@/lib/logger";

/**
 * ============================================================
 * GET /oauth/tiktok/callback, vang TikTok's redirect op
 * ============================================================
 *
 * Dit is de in het TikTok-dashboard geregistreerde redirect_uri.
 * Spiegelt /oauth/meta/callback:
 *   1. ?error → eigenaar heeft geweigerd / TikTok-fout.
 *   2. CSRF-check: query-`state` vs. de cookie van /start.
 *   3. `code` + redirect_uri doorsturen naar de Nest-API
 *      (POST /integrations/tiktok/connect, met Supabase-sessie). Die
 *      wisselt om voor access+refresh-token en slaat VERSLEUTELD op.
 *   4. Terug naar de koppelingen-tab met ?tiktok=...-status.
 *
 * Geen token-exchange hier: het client-secret + de tokens leven alleen
 * in de API-laag.
 */
const RETURN_PATH = "/dashboard/account?tab=koppelingen";
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function back(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL(RETURN_PATH, origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("tiktok_oauth_state", "", { path: "/oauth/tiktok", maxAge: 0 });
  res.cookies.set("tiktok_oauth_rid", "", { path: "/oauth/tiktok", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  // TikTok geeft fouten als ?error / ?error_description terug.
  const oauthError = searchParams.get("error");

  const expectedState = request.cookies.get("tiktok_oauth_state")?.value ?? null;
  const restaurantId = request.cookies.get("tiktok_oauth_rid")?.value ?? null;

  if (oauthError) {
    return back(origin, { tiktok: "denied" });
  }
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return back(origin, { tiktok: "error", reason: "state" });
  }
  if (!code) {
    return back(origin, { tiktok: "error", reason: "no_code" });
  }
  if (!restaurantId) {
    return back(origin, { tiktok: "error", reason: "no_restaurant" });
  }

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
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return back(origin, { tiktok: "error", reason: "auth" });
  }

  try {
    const res = await fetch(`${API_URL}/integrations/tiktok/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Restaurant-Id": restaurantId,
      },
      body: JSON.stringify({ code, redirectUri: tiktokRedirectUri(origin) }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(`[tiktok-oauth] API connect faalde (${res.status}): ${body}`);
      return back(origin, { tiktok: "error", reason: "connect" });
    }
    return back(origin, { tiktok: "connected" });
  } catch (err) {
    logger.error("[tiktok-oauth] API connect error:", err);
    return back(origin, { tiktok: "error", reason: "connect" });
  }
}
