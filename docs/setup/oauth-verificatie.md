# Verificatie-voorbereiding — Google Bedrijfsprofiel & Meta

Voorbereidende teksten + scripts voor de OAuth-verificatie. Alles wat hier
staat kan **nu** al, ook al kan de demovideo pas opgenomen worden zodra de
flow live werkt (Google) of de business-verificatie rond is (Meta).

> De justificatie-teksten staan in het **Engels** — Google- en Meta-reviewers
> beoordelen in het Engels. De demovideo mag Engels zijn, of Nederlands met
> Engelse ondertiteling/samenvatting.

Zie ook: [google-business-setup.md](google-business-setup.md) (Places-API-setup)
en [google-business-approval.md](google-business-approval.md) (API-toegang fase C).

---

## 1. Google — scope-justificatie (`.../auth/business.manage`)

Plak dit (of een ingekorte versie) in **Verification Center → scope-justificatie**
en in het **Business Profile API-toegangsformulier** (use-case).

> **App:** Get-Filly (https://www.get-filly.com) — an AI marketing assistant
> for independent Dutch restaurants (hospitality SaaS).
>
> **What the app does with the scope:** Restaurant owners connect their own
> Google Business Profile so our app can manage their listing on their behalf
> from a single dashboard: read their profile and location data to keep it
> accurate, surface and reply to customer reviews in the owner's tone of voice,
> and publish updates/posts. Each tenant authorizes their own account; we never
> share data between restaurants.
>
> **Why `business.manage` specifically:** It is the single scope the Business
> Profile APIs require for these read-and-write management actions
> (accounts.list, locations, reviews, local posts). We request no other Google
> scopes — no email, profile, Drive or Gmail access — because the app only
> needs to manage the connected Business Profile.
>
> **Data handling:** The OAuth access and refresh tokens are stored encrypted
> at rest (AES-256-GCM; the key lives only in the server environment, never in
> the database). The OAuth client secret is server-side only. The
> authorization request uses a signed, expiring `state` parameter (HMAC) to
> prevent CSRF and to bind the callback to the correct tenant. Per-tenant data
> is isolated with row-level security. Owners can disconnect at any time, which
> revokes the token at Google and deletes it from our store.
>
> **User benefit:** Owners manage their Google presence — reviews and posts —
> with AI assistance, without leaving the Get-Filly dashboard.

**In te vullen vóór indienen (Floris):** rechtspersoon/handelsnaam, support-
e-mail, en bevestigen dat homepage + privacybeleid (`/privacy`) + voorwaarden
(`/voorwaarden`) live en bereikbaar zijn onder het geverifieerde domein.

---

## 2. Google — demovideo-script / storyboard

Doel van de video: laat de **volledige flow** zien én dat de app de scope
**echt gebruikt**. Houd 'm kort (1-3 min), schermopname, rustig tempo.

| # | In beeld | Vertel/toon |
|---|----------|-------------|
| 1 | `https://www.get-filly.com` → inloggen | "This is Get-Filly, a marketing assistant for restaurants. I log in as a restaurant owner." |
| 2 | Dashboard → **Account → Koppelingen** | Laat de koppelingen-lijst zien. |
| 3 | Klik **Verbind** bij *Google Bedrijfsprofiel* | "The owner connects their own Google Business Profile." |
| 4 | **Google consent-scherm** — duidelijk in beeld | Toon de app-naam + de gevraagde toegang (`business.manage`). "The app requests permission to manage the business profile." Klik **Toestaan**. |
| 5 | Terug in de app: **✓ Verbonden** + het *Google Bedrijfsprofiel*-paneel met de opgehaalde account(s) | "After consent we call accounts.list and show the managed profile — proving the access is used." |
| 6 | Een echte actie: review beantwoorden / post plaatsen / profielgegevens tonen | "Here the app uses the access to [reply to a review / update the profile] on the owner's behalf." |
| 7 | (optioneel) **Ontkoppel** | "The owner can revoke access at any time." |

Belangrijk dat **stap 4 en 5** scherp in beeld staan — dat is precies wat de
reviewer wil zien (consent → daadwerkelijk gebruik). Stap 6 kan pas écht zodra
de Business Profile API-toegang is goedgekeurd (quotum 0 tot dan).

---

## 3. Google — end-to-end test (checklist)

Onze endpoints: `connect` (callback), `GET status`, `GET profile`
(accounts.list), `DELETE` (disconnect). Tabel: `integration_credentials`,
provider `google_business`.

- [ ] **Verbinden** (lokaal, flag aan / test-user): Verbind → consent → terug met
      `?google=connected`. Rij verschijnt in `integration_credentials` met
      versleutelde `access_token_encrypted` + `refresh_token_encrypted`, scopes,
      `expires_at`.
- [ ] **Token-refresh**: `expires_at` kunstmatig in het verleden zetten → een
      call die `getAccessToken` gebruikt (bv. het profiel-paneel) → bevestig dat
      er een nieuwe access-token wordt gehaald en opgeslagen, zonder herauth.
- [ ] **Profiel ophalen** (`GET profile`): vóór API-goedkeuring → `api_not_approved`
      (paneel toont "toegang in aanvraag"). Ná goedkeuring → de beheerde
      account(s)/locatie(s) komen terug.
- [ ] **Foutpaden**: weigeren → `?google=denied`; toegang ingetrokken bij Google →
      refresh geeft `refresh_revoked` → UI vraagt opnieuw verbinden.
- [ ] **Ontkoppelen**: DELETE → token bij Google ingetrokken + rij weg; rij toont
      weer "Verbind".
- [ ] **Opruimen**: test-rij van het test-restaurant verwijderen (lokaal = prod-DB).

---

## 4. Meta — parallel (justificaties + demovideo)

Code-kant is af (verbinden + pagina kiezen + publiceren). Wacht op
business-verificatie → App Review met demovideo. Per scope (plak in App Review):

- **pages_show_list** — "List the Facebook Pages the user manages so they can
  choose which Page the app posts to."
- **pages_read_engagement** — "Required by Meta alongside posting; read basic
  Page data needed to publish on the selected Page."
- **pages_manage_posts** — "Publish marketing posts to the selected Facebook
  Page on the business's behalf."
- **instagram_basic** — "Read the Instagram business account linked to the
  selected Page."
- **instagram_content_publish** — "Publish marketing posts to the linked
  Instagram business account."
- **business_management** — "Let the owner connect their business assets
  (Pages/Instagram) so the app can act on their behalf."

**Demovideo Meta** (zelfde aanpak als Google):
1. Inloggen → Account → Koppelingen → **Verbind Facebook**.
2. Meta-consent → toon de gevraagde scopes → toestaan.
3. Terug in de app → **MetaPublishPanel** → pagina kiezen → testbericht naar
   Facebook (+ Instagram).
4. Toon de geplaatste post live op de pagina/het IG-account.

---

## 5. Checklist vóór indienen

**Google**
- [ ] OAuth-client in het **officiële Filly-account** (niet persoonlijke gmail).
- [ ] Redirect-URI's exact: prod + (voor test) localhost.
- [ ] Consent screen: branding compleet, test-user, scope `business.manage`.
- [ ] Domein `get-filly.com` geverifieerd (Search Console) onder dat account.
- [ ] App gepubliceerd naar **Productie** (anders verlopen refresh-tokens na 7d).
- [ ] Business Profile API-toegang aangevraagd (quotum 0 → de lange wachttijd).
- [ ] Demovideo opgenomen (stap 2) + justificatie (stap 1) ingediend.

**Meta**
- [ ] Business-verificatie afgerond.
- [ ] Redirect + deauthorize + data-deletion-URL's opgeslagen (groen) in Meta.
- [ ] Demovideo opgenomen + per-scope-justificaties ingediend → App op Live.
