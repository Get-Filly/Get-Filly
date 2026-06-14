import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { googleRedirectUri, verifyState } from "@/lib/google-oauth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ============================================================
 * GET /oauth/google/callback, vang Google's redirect op
 * ============================================================
 *
 * Dit is de geregistreerde redirect_uri. Google stuurt terug met
 * ?code=&state= (succes) of ?error=access_denied (geweigerd).
 *   1. ?error -> eigenaar weigerde / Google-fout.
 *   2. State verifiëren: handtekening + verloop + nonce-cookie-match.
 *   3. tenant (restaurant-id) komt UIT de getekende state.
 *   4. code doorsturen naar de API (POST .../google-business/connect).
 *
 * Bewust geen token-exchange hier: het client_secret + de tokens leven
 * alleen in de API-laag.
 */
const RETURN_PATH = "/dashboard/account?tab=koppelingen";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Bouwt een redirect terug naar de koppelingen-tab met status-params en
// ruimt de eenmalige cookie op, wat de uitkomst ook is.
function back(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL(RETURN_PATH, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set("google_oauth_nonce", "", {
    path: "/oauth/google",
    maxAge: 0,
  });
  return res;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const oauthError = searchParams.get("error"); // bv. access_denied

  // 1. Eigenaar heeft geweigerd, of Google gaf een fout.
  if (oauthError) {
    logger.warn(`[google-oauth] callback met error=${oauthError}`);
    return back(origin, { google: "denied" });
  }

  // 2. State: handtekening + verloop.
  const payload = returnedState ? verifyState(returnedState) : null;
  if (!payload) return back(origin, { google: "error", reason: "state" });

  // ...en nonce-cookie-match (binding aan deze browser tegen login-CSRF).
  const cookieNonce = request.cookies.get("google_oauth_nonce")?.value ?? null;
  if (!cookieNonce || cookieNonce !== payload.nonce) {
    return back(origin, { google: "error", reason: "state" });
  }

  const restaurantId = payload.rid; // tenant uit de GETEKENDE state
  if (!code) return back(origin, { google: "error", reason: "no_code" });

  // 3. Sessie-token om de API-call te authenticeren. De user kwam net via
  //    een top-level navigatie terug, dus de Supabase-cookies zijn er.
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
  if (!accessToken) return back(origin, { google: "error", reason: "auth" });

  // 4. Code doorsturen. X-Restaurant-Id = tenant uit de state; de API-
  //    guard checkt dat deze user toegang heeft tot dat restaurant
  //    (defense-in-depth). De API mapt Google-fouten naar `reason`.
  try {
    const res = await fetch(`${API_URL}/integrations/google-business/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Restaurant-Id": restaurantId,
      },
      body: JSON.stringify({ code, redirectUri: googleRedirectUri(origin) }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Body alleen server-side loggen; `reason` gebruiken we voor de UI.
      let reason = "connect";
      try {
        const body = (await res.json()) as { reason?: string };
        if (body?.reason) reason = body.reason; // no_refresh, redirect_uri_mismatch, ...
      } catch {
        /* geen JSON-body */
      }
      if (res.status === 403) reason = "access"; // geen toegang tot dit restaurant
      logger.error(
        `[google-oauth] API connect faalde (${res.status}), reason=${reason}`,
      );
      return back(origin, { google: "error", reason });
    }
    return back(origin, { google: "connected" });
  } catch (err) {
    logger.error("[google-oauth] API connect error:", err);
    return back(origin, { google: "error", reason: "connect" });
  }
}
