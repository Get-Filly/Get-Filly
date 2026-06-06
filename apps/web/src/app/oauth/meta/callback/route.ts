import { NextResponse, type NextRequest } from "next/server";

import { exchangeCodeForToken } from "@/lib/meta-oauth";

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
 *   3. `code` → access-token omwisselen (server-side, met secret).
 *   4. Terug naar de koppelingen-pagina met een ?meta=...-status.
 *
 * STAP 3 (nog te bouwen, los punt): de token versleuteld opslaan in
 * een integrations-tabel, gekoppeld aan het restaurant-id uit de
 * `meta_oauth_rid`-cookie. Voor nu bewaren we de token NIET — deze
 * route bewijst alleen dat de hele handshake (redirect_uri + code +
 * secret) klopt. We loggen bewust nooit de token-waarde zelf.
 */

// Waar we de eigenaar na afloop heen sturen: de koppelingen-tab op de
// account-pagina (de losse /dashboard/koppelingen-route is legacy). De
// ConnectionsSection leest de ?meta=...-param en toont een melding.
const RETURN_PATH = "/dashboard/account?tab=koppelingen";

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
  // const restaurantId = request.cookies.get("meta_oauth_rid")?.value; // ← stap 3

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

  // 4. code → access-token (server-side; client_secret gaat mee).
  try {
    const token = await exchangeCodeForToken({ code, origin });

    // Bewust GEEN token-waarde loggen — alleen metadata, zodat we in
    // de logs kunnen zien dat de handshake werkte.
    console.info(
      `[meta-oauth] token-exchange ok: type=${token.token_type ?? "?"} expires_in=${token.expires_in ?? "?"}`,
    );

    // TODO (stap 3): token hier versleuteld opslaan per restaurant.
    return back(origin, { meta: "connected" });
  } catch (err) {
    console.error("[meta-oauth] token-exchange faalde:", err);
    return back(origin, { meta: "error", reason: "exchange" });
  }
}
