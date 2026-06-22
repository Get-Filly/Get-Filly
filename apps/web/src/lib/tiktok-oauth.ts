// ============================================================
// TikTok (Login Kit + Content Posting API) OAuth — "posten namens de zaak"
// ============================================================
// Gedeelde config + helpers voor de twee route-handlers:
//   - /oauth/tiktok/start    → stuurt de eigenaar naar TikTok's consent
//   - /oauth/tiktok/callback → valideert de state en stuurt de `code`
//                              door naar de Nest-API, die de token-
//                              exchange + versleutelde opslag doet
//
// Spiegelt het Meta-patroon (zie meta-oauth.ts). Het Client Secret +
// de code→token-exchange leven NIET hier maar in de Nest-API
// (apps/api/src/tiktok); de callback stuurt alleen de `code` door.
//
// ⚠️ App Review: deze scopes vereisen TikTok-app-review (+ demovideo)
// voordat ze voor externe gebruikers buiten de sandbox werken.
//
// ⚠️ redirect_uri MOET byte-voor-byte gelijk zijn tussen deze code en
// het veld "Redirect URI" in het TikTok-developer-dashboard.
// ============================================================

// Scopes:
//   - user.info.basic : open_id, display_name, avatar_url (account tonen)
//   - video.publish   : Direct Post — de video wordt direct op het account
//                       gepost (met gekozen privacy + disclosure). Strenger in
//                       review dan video.upload; een onaudited app kan alleen
//                       SELF_ONLY (privé) posten.
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;

// Client Key is niet geheim (gaat als client_key mee in de URL), maar we
// lezen 'm server-side zodat alle TikTok-config op één plek staat.
export function tiktokClientKey(): string {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) throw new Error("TIKTOK_CLIENT_KEY ontbreekt in de omgeving");
  return key;
}

// redirect_uri afgeleid van de origin van het verzoek, net als bij Meta,
// zodat start + callback gegarandeerd dezelfde host gebruiken.
export function tiktokRedirectUri(origin: string): string {
  return `${origin}/oauth/tiktok/callback`;
}

// Bouwt de URL van TikTok's toestemmingsscherm. `state` = onze CSRF-token.
// TikTok Login Kit v2: authorize op www.tiktok.com, scope komma-gescheiden.
export function buildAuthorizeUrl({
  origin,
  state,
}: {
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_key: tiktokClientKey(),
    redirect_uri: tiktokRedirectUri(origin),
    state,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}
