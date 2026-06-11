import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { metaRedirectUri } from "@/lib/meta-oauth";
import { logger } from "@/lib/logger";

/**
 * ============================================================
 * GET /oauth/meta/callback, vang Meta's redirect op
 * ============================================================
 *
 * Dit is de `redirect_uri` die in het Meta-dashboard staat. Meta
 * stuurt de eigenaar hierheen terug met ?code=&state= (succes) of
 * ?error=... (geweigerd). Hier gebeurt:
 *   1. Bij ?error → de eigenaar heeft geweigerd / Meta-fout.
 *   2. CSRF-check: query-`state` moet matchen met de cookie die
 *      /oauth/meta/start zette.
 *   3. De `code` + redirect_uri doorsturen naar de Nest-API
 *      (POST /integrations/meta/connect, geauthenticeerd met de
 *      Supabase-sessie). Die wisselt de code om voor een long-lived
 *      token en slaat 'm VERSLEUTELD op per restaurant.
 *   4. Terug naar de koppelingen-tab met een ?meta=...-status.
 *
 * Bewust géén token-exchange hier: het app-secret + de token leven
 * alleen in de API-laag.
 */

// Waar we de eigenaar na afloop heen sturen: de koppelingen-tab op de
// account-pagina (de losse /dashboard/koppelingen-route is legacy). De
// ConnectionsSection leest de ?meta=...-param en toont een melding.
const RETURN_PATH = "/dashboard/account?tab=koppelingen";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Bouwt een redirect terug naar de koppelingen-pagina met status-params.
function back(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL(RETURN_PATH, origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  // De eenmalige cookies mogen weg, wat de uitkomst ook is.
  res.cookies.set("meta_oauth_state", "", { path: "/oauth/meta", maxAge: 0 });
  res.cookies.set("meta_oauth_rid", "", { path: "/oauth/meta", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const expectedState = request.cookies.get("meta_oauth_state")?.value ?? null;
  const restaurantId = request.cookies.get("meta_oauth_rid")?.value ?? null;

  // 1. Eigenaar heeft in de Meta-dialog geweigerd, of Meta gaf een fout.
  if (oauthError) {
    return back(origin, { meta: "denied" });
  }

  // 2. CSRF-check. Mismatch (of ontbrekende cookie/state) → afbreken.
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return back(origin, { meta: "error", reason: "state" });
  }

  // 3. Zonder code valt er niets om te wisselen.
  if (!code) {
    return back(origin, { meta: "error", reason: "no_code" });
  }

  // 4. Zonder restaurant-id weten we niet aan welke zaak we koppelen.
  if (!restaurantId) {
    return back(origin, { meta: "error", reason: "no_restaurant" });
  }

  // 5. Sessie-token ophalen om de API-call te authenticeren. De user
  //    kwam net via een top-level navigatie terug, dus de Supabase-
  //    cookies zijn aanwezig (SameSite=Lax) en doorgaans vers.
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
    return back(origin, { meta: "error", reason: "auth" });
  }

  // 6. Code doorsturen naar de API; die wisselt om + slaat versleuteld op.
  try {
    const res = await fetch(`${API_URL}/integrations/meta/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Restaurant-Id": restaurantId,
      },
      body: JSON.stringify({ code, redirectUri: metaRedirectUri(origin) }),
      cache: "no-store",
    });

    if (!res.ok) {
      // We lezen de body voor de server-log, lekken 'm niet naar de client.
      const body = await res.text();
      logger.error(
        `[meta-oauth] API connect faalde (${res.status}): ${body}`,
      );
      return back(origin, { meta: "error", reason: "connect" });
    }

    return back(origin, { meta: "connected" });
  } catch (err) {
    logger.error("[meta-oauth] API connect error:", err);
    return back(origin, { meta: "error", reason: "connect" });
  }
}
