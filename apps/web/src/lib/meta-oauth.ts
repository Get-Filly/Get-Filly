// ============================================================
// Meta (Facebook/Instagram) OAuth — "posten namens de zaak"
// ============================================================
// Gedeelde config + helpers voor de twee route-handlers:
//   - /oauth/meta/start    → stuurt de eigenaar naar de Meta-dialog
//   - /oauth/meta/callback → valideert de state en stuurt de `code`
//                            door naar de Nest-API, die de token-
//                            exchange + versleutelde opslag doet
//
// Dit is de "posten namens de zaak"-variant (Graph API), GEEN
// "inloggen met Facebook". We schrijven de OAuth-call dus zelf,
// zonder Supabase ertussen.
//
// ⚠️ App Review: de scopes hieronder vereisen Meta App Review
// voordat ze voor externe gebruikers werken. In dev/test werken ze
// alleen voor accounts met een rol in de Meta-app (admin/tester).
//
// ⚠️ redirect_uri MOET overal exact gelijk zijn — byte-voor-byte —
// tussen: (1) deze code, (2) de authorize-stap, (3) de token-stap en
// (4) het veld "Geldige OAuth-redirect-URI's" in het Meta-dashboard.
// Eén afwijking (http vs https, www vs apex, trailing slash) →
// Meta weigert met `redirect_uri_mismatch`.
// ============================================================

// Graph-API-versie. Meta versioneert z'n API en deprecet oude
// versies ~2 jaar na release. Houd dit gelijk aan de versie in het
// Meta-dashboard (App → Instellingen → Geavanceerd → API-versie).
// Override via env als je bumpt.
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

// Scopes die nodig zijn om namens de zaak te posten op Facebook + Instagram.
//   - pages_show_list           : lijst van FB-pagina's die de gebruiker beheert
//   - pages_read_engagement     : door Meta vereist náást manage_posts
//   - pages_manage_posts        : posts publiceren op de FB-pagina
//   - instagram_basic           : het aan de pagina gekoppelde IG-account lezen
//   - instagram_content_publish : posts publiceren op het IG-account
//   - business_management        : Business-assets (pagina's/IG) koppelen
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
] as const;

// De redirect_uri leiden we af van de origin van het inkomende
// verzoek. Zo gebruiken start + callback gegarandeerd dezelfde host
// als waarop je draait — nu www.get-filly.com, straks ook de
// app.get-filly.com-test-URL — zonder dat we 'm hardcoden. Elk
// Vercel-domein waarop je de flow draait moet als geldige
// redirect-URI in het Meta-dashboard staan.
export function metaRedirectUri(origin: string): string {
  return `${origin}/oauth/meta/callback`;
}

// App ID is niet geheim (gaat sowieso als client_id mee in de URL),
// maar we lezen 'm wél server-side zodat alle Meta-config op één plek staat.
export function metaAppId(): string {
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID ontbreekt in de omgeving");
  return id;
}

// NB: het App Secret + de code→token-exchange leven NIET in de web-laag
// maar in de Nest-API (apps/api/src/meta). De callback stuurt alleen de
// `code` door; zo komt de long-lived token nooit in de browser-laag en
// staat het secret op één plek.

// Bouwt de URL van de Meta-toestemmingsdialog waar we de eigenaar
// heen sturen. `state` is onze CSRF-token (zie start-route).
export function buildAuthorizeUrl({
  origin,
  state,
}: {
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: metaAppId(),
    redirect_uri: metaRedirectUri(origin),
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}
