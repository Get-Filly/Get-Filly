# Get Filly — Backlog

Alles wat nog open staat. **Werk deze lijst bij** zodra iets klaar is, of
wanneer je iets nieuws tegenkomt dat later aandacht nodig heeft. Dit is dé
referentie voor elke werksessie — zowel voor jou als voor Claude in nieuwe
chats.

> **Alleen open werk.** Zodra iets af is verhuist het naar
> [`docs/CHANGELOG.md`](docs/CHANGELOG.md), samen met het verhaal erachter.
> Dat scheelt het doorspitten van voltooid werk om te zien wat er nog moet.

## Prioriteiten

- **P0** — Blokkerend voor eerste klant live
- **P1** — Productie-hygiëne (moet vóór publieke launch)
- **P2** — Feature-werk (mock → echt)
- **P3** — UX-verfijningen / nice-to-have

Status-markers: `[ ]` = todo · `[~]` = in progress · `[x]` = done

---


## 🔴 Vóór externe testers — de korte lijst (bijgewerkt 2026-09-16)

Dit zijn de punten die er tussen nu en een klant-testbare versie staan. De
eerste twee kan Claude niet zelf doen.

- [ ] **E-mailbevestiging aanzetten in Supabase.** Staat uit als dev-gemak, dus
      iedereen kan zich met een willekeurig adres aanmelden. Dit is het enige
      echt blokkerende punt voor mensen van buiten. Handmatig in Supabase +
      één keer de hele registratieflow doorlopen. *(Kan Claude niet doen.)*
- [ ] **De flow één keer end-to-end doorlopen op een echt account.** Het
      grootste gat in alles wat er deze week gebouwd is: er is geen enkel
      scherm als ingelogde gebruiker gezien — alles is beredeneerd uit code,
      unit-tests en prototypes op `/proto-*`. Concreet na te lopen: kans op het
      dashboard → geleide flow → concept op het bord → detailpagina (staat de
      "waarom juist deze dag"-regel er?) → rapportage. *(Vraagt een login die
      Claude niet heeft.)*
- [ ] **Jaarview-heatmap draait nog op verzonnen data** (`chart-card.tsx`,
      `calendar-card.tsx`). Zelfde soort fout als de bezettingspagina had, en
      nog niet opgeruimd. Zie "Mock-data als echt gepresenteerd" hieronder.
- [ ] **Koppelingen opnieuw verbinden.** In de hele database staat één
      credential: een TikTok-token dat op 1 juli is verlopen. Meta en Google
      Bedrijfsprofiel zijn voor géén enkele zaak opgeslagen. Voor een demo of
      een test moet dat via de koppelingen-pagina opnieuw verbonden worden;
      een OAuth-flow kan Claude niet doorlopen.
- [ ] **WAF / Vercel Firewall.** De rem per IP (mig 0076) stopt één bron die
      doorramt, geen gedistribueerde aanval.

- [ ] **`instagram_manage_contents` door Meta App Review.** De scope is
      toegevoegd (2026-09-25) zodat een gestopte campagne de Instagram-post
      echt verwijdert. In Development Mode werkt dat meteen voor accounts mét
      een rol in de app — genoeg om de screencast op te nemen — maar voor
      klanten moet de scope goedgekeurd zijn. **Controleer ook of
      `META_GRAPH_VERSION` mee moet**: de default staat nu op v23.0; geeft Meta
      "Unknown path components" op een delete, zet 'm dan een versie hoger.
- [ ] **Bestaande Meta-koppelingen opnieuw leggen.** Een koppeling van vóór
      25 september heeft de nieuwe scope niet. Verwijderen faalt dan met een
      permissiefout; de app zegt dat ook en linkt naar de koppelingen-pagina.

### Wat deze week is afgerond

- [x] Rustige momenten variëren per datum (weer, evenementen, feestdagen) +
      beleidslaag — fase 1 t/m 4, live
- [x] Terugkoppeling: meet of het moment waarvoor een campagne bedoeld was ook
      echt voller werd (mig 0074)
- [x] Maandoverzicht dat de prune overleeft (mig 0075), zodat "vs vorig jaar"
      over twaalf maanden kan
- [x] Bezettingsrapportage op echte data; verzonnen heatmap, YoY en cohort weg
- [x] "Wat werkt bij jou" per kanaal op Resultaat
- [x] Mail eruit als campagnekanaal
- [x] Rem per IP op contactformulier en onboarding-AI (mig 0076)
- [x] De reden voor de dagkeuze zichtbaar op de campagne

---


## P0 — Blokkerend voor eerste klant

### Auth & onboarding
- [ ] ⚠️ **Email-confirmation weer aanzetten** — tijdelijk UIT gezet tijdens dev (Supabase Dashboard → Authentication → Providers → Email → "Confirm email"). **Aanzetten vóór productie-launch** anders accepteert de app fake-signups. Los op met Resend SMTP (hieronder) zodat je niet meer tegen rate-limits aanloopt en je dit weer aan kunt hebben in dev. **Update 2026-06-02**: minder kritiek geworden — self-service signup staat nu volledig UIT in Supabase (zie hieronder), dus publieke fake-signups zijn sowieso onmogelijk. Blijft nice-to-have voor (uitgenodigde) users.
- [x] ~~**Self-service signup dichtgezet (invite-only)**~~ (2026-06-02) — concurrenten kunnen zich niet meer zelf registreren. Supabase "Allow new users to sign up" = UIT (de échte lock, blokkeert óók directe API-calls met de anon-key). Login toont nu "Vraag een demo aan" → `/contact` i.p.v. registratielink; `/signup`-route redirect naar `/contact`; `/signup` uit de auth-paden in middleware. Nieuwe klant: Floris maakt 'm aan via Supabase (Authentication → Users → Add user, "Auto Confirm User" aan) → klant logt in → middleware stuurt naar `/onboarding` (geen `restaurant_users`-rij) → eigen zaak. Zie changelog 2026-06-02.
- [x] ~~**Team-invite landde op /onboarding i.p.v. dashboard**~~ (2026-06-08, fix `78248d3`) — `team.controller` las `process.env.FRONTEND_URL` (nooit gezet) → invite-accept-URL viel terug op `http://localhost:3000` → `/auth/confirm` weigerde die cross-origin `next` (open-redirect-bescherming) → fallback `/dashboard` → middleware → `/onboarding`. Fix: leest nu `WEB_URL`. **Config gezet (2026-06-08):** `WEB_URL=https://www.get-filly.com` in `get-filly-api` ✅ + Supabase Site URL & Redirect URLs op `https://www.get-filly.com` ✅ (loste óók de data-deletion-status-URL + mail-unsubscribe-links op). **Resteert alleen nog:** teamlid-invite end-to-end testen (moet in dashboard landen mét permissies).
- [~] **CRM-klantuitnodiging + `/welkom` + onboarding — code af, nog niet live** (2026-06-03) — nieuwe klanten worden via het CRM uitgenodigd → activeren op `/welkom` (wachtwoord instellen) → middleware → onboarding. **Code staat klaar maar is nog NIET gedeployed/geconfigureerd**: `apps/web/src/app/welkom/page.tsx`, `apps/api/src/integrations/*` (POST `/api/integrations/crm/invite`, beveiligd met `CRM_INTEGRATION_API_KEY` + constant-time check), invite-mailtemplate met onboarding-tips (`scripts/supabase-email-templates.mjs`), briefje in [docs/setup/crm-koppeling.md](docs/setup/crm-koppeling.md). **Nog te doen om live te gaan:**
  - [ ] `CRM_INTEGRATION_API_KEY` zetten in Vercel `get-filly-api` (Production + Preview) + `apps/api/.env`; veilig delen met de CRM-collega.
  - [ ] Supabase → Authentication → URL Configuration → Redirect URLs: `<WEB_URL>/welkom` toevoegen (bv. `https://get-filly.com/welkom`).
  - [x] ~~Code committen + pushen~~ (2026-06-03) — gecommit + gepusht; deployt **inert** (endpoint geeft 401 tot de sleutel staat, `/welkom` is nergens gelinkt, mailtemplate gaat pas live met `apply-templates`).
  - [ ] Mailtemplate uitrollen: `pnpm supabase:apply-templates`.
  - [ ] End-to-end test: `curl`-invite (zie briefje) → mail → `/welkom` → onboarding.
  - [ ] CRM-kant: collega laten aansluiten op het endpoint (server-side, sleutel in header). Zie briefje.
  - [ ] 🟡 (aanrader) Vast api-domein i.p.v. `get-filly-api-three.vercel.app` — bv. `api.get-filly.com` als custom domain op het get-filly-api-project, zodat de CRM-URL én `NEXT_PUBLIC_API_URL` stabiel blijven als het vercel.app-domein ooit verschuift (het `-three`-suffix verraadt dat het al eens veranderd is).
- [~] **Geocoding bij adres-invoer** — GeocodingService via PDOK Locatieserver (gratis, EU, officiële NL-bron) live sinds 2026-04-24. Onboarding haalt nu lat/long op direct na restaurant-insert. **Nog te doen**: (1) eenmalig backfill-script voor bestaande restaurants zonder coords, (2) geocode opnieuw triggeren bij adres-wijziging op account-pagina (zodra die bestaat).
- [x] ~~Empty-states-sweep dashboard~~ (2026-04-29) — alle dashboard-pagina's tonen nu rustige empty-states i.p.v. rode HTTP-banners. Geraakt: KpiRow, WeatherForecast, suggesties, campagnes-detail, account, rapportages (volledige empty-state voor nieuwe klanten zonder data), reviews (verwijst naar koppelingen-pagina). Form-validation rood-kaders (reserveringen-modal, review-reply-modal) blijven rood — passend voor user-action-fouten.
- [x] ~~Signup → auto-restaurant-creatie~~ — `/onboarding`-wizard live (2026-04-24, commit `5d888c9`)
- [x] ~~Password-reset flow~~ — `/forgot-password` + `/reset-password` live (2026-04-24, commit `335f5a1`)
- [x] ~~Wachtwoord-eisen + confirmatie-veld~~ — signup en reset-password gebruiken herbruikbaar `<PasswordStrength>` component met live checklist (8+ tekens, letter, cijfer, speciaal teken). Submit disabled tot groen (2026-04-24, commit `15fe843`).
- [x] ~~Supabase email-templates geautomatiseerd~~ — `pnpm supabase:apply-templates` PATCHt alle 4 templates (invite, magic-link, recovery, confirmation) via Management API. Geen handwerk meer in dashboard. (2026-04-24, commit `2775f08`)
- [x] ~~Onboarding met Filly-auto-invul~~ — URL + menukaart → Filly vult hele profiel in (description, tagline, atmosphere, target_audience, USPs, events, signature_dishes, cuisine_style, adres, toon) + menu-items via Opus Vision. Wizard: bronnen → review → bevestig (2026-04-24, commits `b29f317` + `d909c65`).

### Legal & compliance (AVG/NL)
- [x] ~~**Privacy-verklaring**~~ (2026-05-30) — `/privacy` volledig vervangen door de uitgebreide aangeleverde tekst (20 secties + 4 overzichtstabellen: doel/rechtsgrond, subverwerkers, bewaartermijnen). Afgestemd op AVG + Google OAuth Verification + Meta App Review + Stripe + bunq + Anthropic/Claude. Bedrijfsgegevens ingevuld in `config/company.ts` (KvK 42068177, Saxen Weimarlaan 44-2 Amsterdam, +31 6 57737372). Concept-banner verdwenen. **Blijft formeel concept tot jurist-review.**
- [x] ~~**Algemene voorwaarden**~~ (2026-05-30) — `/voorwaarden` volledig vervangen door aangeleverde tekst (18 secties + definitietabel). Aansprakelijkheidsmax (€ 25.000) + rechtbank (Amsterdam) ingevuld in `config/company.ts`. Verwijst naar Verwerkersovereenkomst (art. 28 AVG) die nog opgesteld moet worden (zie DPA-item). **Blijft formeel concept tot jurist-review.**
- [ ] **Jurist-review legal-teksten** — laten reviewen door privacy/SaaS-jurist vóór eerste klant. Met name: aansprakelijkheidslimiet (€ 25.000), SLA-claim (99%), IP-clausule AI-output, prijswijzigings-clausule, Stripe/bunq als verwerkers. De live-teksten zijn de aangeleverde conceptversie (30 mei 2026).
- [x] ~~**`/delete-data`-pagina (Meta data deletion)**~~ (2026-06-06) — publieke pagina `apps/web/src/app/delete-data/page.tsx` (legal-stijl, in sitemap). Uitleg: account verwijderen via Account → "Account permanent verwijderen", Meta-koppeling intrekken (Meta-zijde: Apps en websites), welke gegevens + 30-dagen-termijn, contact via `COMPANY.privacyEmail`. **Restje**: zin "wij wissen de opgeslagen token" klopt pas écht zodra token-opslag (stap 3) + een in-app loskoppel-knop bestaan; tekst is nu bewust naar account-delete/e-mail-verzoek geschreven om geen niet-bestaande knop te beloven.
- [x] ~~**Cookie-banner**~~ (2026-04-29) — `<CookieBanner />` in root-layout, accept/reject in localStorage. Klaar voor wanneer Plausible/PostHog erbij komt (analytics-init achter consent-check).
- [x] ~~**AVG-endpoints** — data-export~~ (2026-04-29) + ~~right-to-be-forgotten (account-delete)~~ (2026-04-30). Account-delete via `DELETE /restaurant/me/account` met `{ confirmation: "VERWIJDER" }`-body. UI-knop op account-pagina sectie "Data & privacy". Verwijdert auth.users + alle owner-restaurants → cascade business-data; blokkeert als andere team-members bestaan. Bewijs-rij in `account_deletions`-tabel (geen PII).
- [~] **Data-classificatie + anonimisering-bij-delete** — fase 1 live per 2026-04-30: continue benchmark-anonymisering bij `campaign.status → afgerond` schrijft een rij in `campaign_benchmarks` (cuisine + region=provincie + capacity-bucket + month + theme + result-metrics, géén body, géén FK, GDPR Recital 26). Laatste-vangnet bij delete via `AnonymizationService.benchmarkAllCompletedFor()`. **Fase 2 nog open**: (1) body-templates extraheren met LLM-stripping van eigennamen, (2) menu-pattern-aggregatie, (3) `docs/data-classification.md` met per-tabel-categorie, (4) Filly's prompts verrijken met benchmark-queries.

### Hosting-deploy (2026-05-08 → 2026-05-21 compleet)
- [x] ~~**Frontend live op `get-filly-web.vercel.app`**~~ — gedeployed 2026-05-08, beschermd met basic-auth middleware via env-vars `DEMO_AUTH_USERNAME` + `DEMO_AUTH_PASSWORD`. Vercel Hobby (geen native password-protection). URL kan privé gedeeld worden, browser-popup voor login.
- [x] ~~**API live op Railway** `api-production-9682.up.railway.app/api`~~ (2026-05-21, commits `d9d61f6` + `881fac1` + `15a5e7b` + `551177c`). Vercel-route afgeschreven (Nest = persistent server, niet serverless). Railway-config: `railway.json` in repo root met `pnpm install --filter "api..."` + `pnpm --filter api build` + `start:prod`. **Node 22.x verplicht** (engines + .nvmrc) — jose@6 is ESM-only en `require(esm)` is pas default vanaf Node 22. CORS in `apps/api/src/main.ts` leest `WEB_URL` + `CORS_ORIGINS` uit env. Watch Paths leeg = redeploy bij elke main-push. Env-vars 1-op-1 uit lokale `.env` overgezet, behalve `WEB_URL` (lokaal localhost:3000 → prod Vercel-URL). Bewezen werking: `curl /api/hello` → 200, login + dashboard zonder Geen-toegang-melding.
- [x] ~~**CI Suspense-fix**~~ (2026-05-21, commit `28bdfe2`) — Next.js 15+ vereist `<Suspense>`-wrapper rond `useSearchParams()` voor prerender. Account-page + google-business/reviews waren broken; refactor: inner-component houdt hooks, default-export wikkelt 'm in `<Suspense fallback={null}>`. Vercel-build was groen sindsdien.
- [x] ~~**Web-deploy werd stil overgeslagen (ignore-build-step)**~~ (2026-06-02, commit `1fd6271`) — Vercel's "Skip unaffected projects" keek alleen naar de láátste commit van een push; eindigde die op een docs/api-commit, dan annuleerde Vercel de web-build ("Canceled by Ignored Build Step") terwijl een eerdere commit wél `apps/web` raakte → productie bleef op oude code. Fix: eigen `apps/web/vercel.json` (`ignoreCommand: bash scripts/vercel-ignore-build.sh`) die `git diff` doet tussen `VERCEL_GIT_PREVIOUS_SHA` (laatste geslaagde deploy) en `VERCEL_GIT_COMMIT_SHA` over `apps/web` + `packages/shared` + `pnpm-lock.yaml` + `package.json`. Exit 0 = overslaan, !=0 = bouwen; faalt bewust naar bouwen. Zie changelog 2026-06-02.
- [x] ~~🟡 **`get-filly-api` heeft dezelfde latente deploy-skip**~~ (2026-06-11) — `apps/api/scripts/vercel-ignore-build.sh` (spiegel van de web-variant) + `ignoreCommand` in `apps/api/vercel.json`. Diff't over `apps/api` + `packages/shared` + `pnpm-lock.yaml` + `package.json` tussen laatste geslaagde deploy en huidige commit; faalt bewust naar bouwen. Lost beide kanten op: een echte api-wijziging wordt nooit meer overgeslagen, én docs-only pushes (bv. BACKLOG-commits) triggeren geen overbodige api-redeploy meer. Gedrag getest in scratch-repo (docs-only → skip, api-wijziging → bouwen, geen previous SHA → bouwen). NB: de éérste deploy ná deze wijziging bouwt sowieso — `VERCEL_GIT_PREVIOUS_SHA` wordt pas gevuld zodra de ignore-step bestaat.
- [ ] **Bundle '+ Kanaal toevoegen' (fase 4b)** — op `/campagnes/bundle/[id]` staat de knop nu disabled. Implementatie: POST `/campaigns/bundle/:groupId/channels` met `{platform, body, subject_line?, scheduled_for?}` → maakt nieuwe campagne onder dezelfde group_id. UI: platform-keuze-modal of toggle-pillen zoals voorstel-pagina. Optioneel Filly-tekst-generate voor het nieuwe kanaal.

### Autonome detectie + push-meldingen (concept-flow, 2026-05-08)
Eigenaar's vision: Filly checkt dagelijks (event-driven via reserveringsplatform), spot rustige dagen op basis van threshold, push-melding naar eigenaar → klik → genereer voorstel → bundle ontstaat in /campagnes.
- [x] ~~**Low-occupancy threshold per restaurant**~~ (2026-06-11) — kolom `low_occupancy_threshold` (mig 0037) + slider op account-pagina + dashboard waren al live; laatste restje gefixt: `detectAndGenerateLowOccupancy` leest nu óók de kolom per restaurant (`suggestions.service.ts`, stap 1b), de constante 50 is alleen nog fallback voor restaurants zonder eigen waarde. Drempel staat ook in de Claude-prompt per dag.
- [ ] **Autonome detectie** — bij data-event vanuit reserveringsplatform (Zenchef etc.) automatisch `detectAndGenerateLowOccupancy` triggeren (i.p.v. handmatige knop). NB: per memory géén interne cron, alléén event-driven.
- [ ] **Push-meldingen** — opties: (a) Email-interim via Resend (snel, 2-3u), (b) Web Push via PWA (10-12u, werkt cross-platform), (c) Mobile app + native push (weken, App Store). Sprint-keuze: start met (a), later (b).
- [ ] ⚠️ **Bezetting in de dag-keuze is nu seeded nep-data** (gevonden 2026-06-12) — `buildWindowOccupancy` (`apps/web/src/lib/occupancy-window.ts`) valt voor elke dag zónder rij in `occupancy_days` terug op `seededOccupancy` (demo-formule: ma/di/wo 40-69%, do 55-79%, vr/za/zo 78-99%). Voor een echt restaurant zónder bezettingsdata (`occupancy_days` leeg + 0 reserveringen, geverifieerd voor Bar Barolo `71ecad93`) zijn de "rustige dagen" in zowel de geleide chat-flow als het dashboard-blok (`useActionableDays`) dus volledig **verzonnen**. Symptoom dat Floris vond: Filly zegt in proza "alle dagen rustig" (leest reserveringen) maar de dag-picker toont maar 1 dag (`di 23 jun` = toevallig seeded 42%). De seeded-fallback was bedoeld als demo-scaffolding voor het demo-account, niet voor echte tenants.
  **Afwegingen / opties (beslissing volgt — Floris):**
  - **A (eerlijk, aanbevolen):** flow + hook gebruiken alleen ECHTE `occupancy_days`; ontbreekt die, toon de komende OPEN dagen als klikbare keuze (+ speciale dagen) i.p.v. nep-percentages. Raakt ook het dashboard-blok (gedeelde `useActionableDays`-hook) → toont dan eerlijk "geen rustige dagen". Geen capaciteitsmodel nodig. Nadeel: zonder data geen "deze dag heeft écht een actie nodig"-signaal meer.
  - **B (echt, grootste klus):** `occupancy_pct` echt berekenen (reserveringen ÷ capaciteit) en `occupancy_days` vullen via een pipeline. Vereist een capaciteits-/coversmodel + event-driven trigger — hangt aan de reserveringskoppeling (Zenchef, zie "Autonome detectie" hierboven). Beste resultaat; lost meteen ook de autonome-detectie op.
  - **C (splitsen):** alleen de chat-flow laat seeded los; dashboard houdt seeded tot B. Kleinste blast-radius, maar dashboard tijdelijk inconsistent.

### Billing
> ⚠️ **Betaalprovider-wijziging (2026-05-30)**: de aangeleverde legal-teksten
> (privacy + voorwaarden) noemen **Stripe** (betalingen) + **bunq** (zakelijke
> bank/administratie) — NIET Mollie. De privacy/voorwaarden zijn hierop al
> live. Billing-implementatie hieronder dus op Stripe baseren, niet Mollie.
- [ ] **Stripe-integratie** — SDK installeren, checkout-flow op pricing-pagina (creditcard/SEPA/iDEAL). Verwerkersrol + privacy al beschreven in de legal-teksten.
- [ ] **Migratie `subscriptions`-tabel** — plan + status + stripe_customer_id + stripe_subscription_id
- [ ] **Plan-enforcement** — limieten per plan (AI-calls, campagnes, teamleden) afdwingen in backend
- [ ] **Stripe webhook** — status-changes opvangen (trial → active → past_due → cancelled)
- [ ] **bunq-koppeling** (later) — zakelijke bankadministratie/reconciliatie. Genoemd in legal als verwerker; implementatie pas relevant als de boekhoud-flow er is.

---


## P1 — Productie-hygiëne

### ⚡ Chat sneller + goedkoper (Filly-chat-performance, P1 — 2026-06-25)
De dashboard-chat "denkt lang na" en verbruikt veel (input-)tokens. Diagnose:
het antwoord wordt niet gestreamd én de hele context (incl. volledig menu + live
data) gaat elke beurt mee. NB: `maxTokens` is een PLAFOND, geen verbruik — het
model stopt zodra het antwoord klaar is. De cap van de chat is 2000 (niet 20k);
de 16k/24k-caps zitten in de menu-importer (eenmalig bij upload), de 20k bij de
website-analyzer (tekens, onboarding).
- [x] ~~**Context-opbouw parallel**~~ (✅ 2026-06-25, `779b8cc`) — historie-fetch + system-prompt-opbouw via `Promise.all` (was sequentieel). Kleine winst.
- [ ] **Streaming (woord-voor-woord, SSE)** — grootste *perceived*-snelheidswinst: tekst verschijnt terwijl Filly typt i.p.v. wachten op het hele antwoord. Backend: streaming-endpoint; frontend: incrementeel renderen; let op: machine-blokken (`<<FILLY_PROPOSE_CAMPAIGN>>` / `FILLY_START_GUIDED`) uit de zichtbare stream filteren. *(zie ook P3 "Streaming")*
- [ ] **Menu uit elke chat-prompt halen / inkorten** — `buildMenuBlock` stuurt nu tot 150 food + 100 drink items mee in ÉLK chatbericht (`restaurant-context.service.ts:259`). Voor de meeste chatvragen onnodig → samenvatten/top-X of alleen op verzoek meesturen. Fors minder input-tokens per beurt + sneller.
- [ ] **Prompt-cache repareren** — de live data (weer/bezetting, verandert elke call) zit ín het gecachete system-prompt-deel → dat breekt de cache telkens. Volatile live-blok naar de user-prompt (of ná de cachebare prefix) verplaatsen → cache pakt wél (~90% korting op input bij vervolgberichten). Zorgvuldig: raakt Filly's prompt → gedrag verifiëren.

### Infrastructuur & deploy
- [x] ~~**Vercel + GitHub consolideren naar het Developer-account**~~ (✅ AFGEROND 2026-06-01) — alles draait nu op **één** Vercel-account (Developer, scope `get-fillys-projects`) + **één** repo (`Get-Filly/Get-Filly`): get-filly.com + www + api live daar, web→`get-filly-api-three.vercel.app/api`, `CORS_ORIGINS` gezet (plain), personal-duplicaten verwijderd, oude repo `Florisbwkoevermans/get-filly` gearchiveerd, `oldrepo`-remote weg. **Eén push naar Get-Filly/Get-Filly deployt nu alles** (geen `git push oldrepo` meer). Details + gotcha's in auto-memory "Stand 2026-06-01". Restje: Pro+Fluid Compute bij launch; `WEB_URL` op api leeg. _Oorspronkelijke context hieronder:_ de LIVE projecten `get-filly-api` + `get-filly-web` draaien nu in het **persoonlijke** Vercel-account (`florisbwkoevermans-projects`) en hangen aan de **OUDE** repo `Florisbwkoevermans/get-filly`. In het Developer-account (`developer@get-filly.com`) staan duplicaten gekoppeld aan de nieuwe repo `Get-Filly/Get-Filly`. **Doel: alles naar één opzet — Developer-account + repo `Get-Filly/Get-Filly`.** Stappen: (1) live projecten naar het Developer-team transferren (of opnieuw importeren) + domeinen get-filly.com/www meeverhuizen; (2) Git-koppeling op `Get-Filly/Get-Filly` zetten zodat een push naar de nieuwe repo de live site deployt (**nu nog `git push oldrepo main` nodig**); (3) **`florisbwkoevermans` volledig loskoppelen van Vercel** (persoonlijke projecten verwijderen, account eruit); (4) oude repo `Florisbwkoevermans/get-filly` archiveren. Tot dat klaar is: bij elke deploy óók naar de oude repo pushen, anders raakt de wijziging de live site niet.
- [x] ~~**Backend-migratie naar Vercel (Nest → all-Vercel)**~~ (2026-05-28/29) — gekozen route: **Optie A**, Nest as-is op Vercel serverless via custom handler. Setup: `apps/api/api/index.ts` wrapt de Nest-app als Express-instance, `apps/api/vercel.json` met catch-all rewrite `/api/(.*) → /api/index` + region `fra1` + 10s maxDuration (Hobby). Aparte Vercel-project `get-filly-api` aangemaakt, rootDir = `apps/api`, Framework Preset = `Other`, "Include files outside root in Build Step" aan. Alle 9 env-vars geïmporteerd uit apps/api/.env. Frontend `NEXT_PUBLIC_API_URL` op `https://get-filly-api.vercel.app/api` voor Production + Preview. Railway-service "api" succesvol verwijderd na werkende smoke-test (login, dashboard, reserveringen, gasten, reviews, campagnes, mail-send). **Bekende limieten op huidige Hobby-plan**: Filly-chat + Vision-imports timeouten op 10s; menukaart-uploads >4.5MB falen (workaround = Supabase Storage signed URLs, P2 backlog). Resend-webhook URL nog niet ingesteld (bestond niet bij Railway, blijft op P1 backlog). Server-side keys cleanup `get-filly-web` op P1 backlog gezet (security). **Correctie 2026-06-03**: het werkende api-domein is `https://get-filly-api-three.vercel.app/api` — `get-filly-api.vercel.app` geeft `DEPLOYMENT_NOT_FOUND` (Vercel kende dat domein niet (meer) toe). Controleer of `NEXT_PUBLIC_API_URL` in het get-filly-web Vercel-project op het `-three`-domein staat, anders kan het live dashboard de api niet bereiken.
- [x] ~~**vercel.json voor web** — deploy-config~~ (afgevinkt 2026-06-11) — bestond al sinds de deploy-skip-fix van 2026-06-02 (`1fd6271`): `apps/web/vercel.json` met `ignoreCommand`. Dit losse regeltje was nooit bijgewerkt.
- [x] ~~**Railway/Render config voor api**~~ — vervallen 2026-05-29: Railway-service verwijderd na geslaagde Vercel-migratie.
- [ ] **Password-protected preview-deploy** op `app.get-filly.com` — eerste live URL waar we Meta-OAuth + echte tests kunnen doen
- [ ] **Staging-Supabase** — aparte DB voor tests/Meta-review zonder productie-risico
- [ ] **GitHub Actions CI** — type-check + lint + build op elke PR

### Monitoring & analytics
- [ ] **Sentry** — error-tracking backend + frontend
- [ ] **Plausible** (of PostHog) — analytics op publieke site + dashboard
- [ ] **Cost-alerts Anthropic** — mail als daglimiet overschreden

### Security hardening (multi-tenant, 1000+ klanten)
- [x] ~~**Per-request Supabase-client met user-JWT**~~ (2026-05-01) — `RequestSupabaseService` (Scope.REQUEST) bouwt per HTTP-call een Supabase-client met het user-JWT uit de Authorization-header. RLS-policies pakken het via `auth.uid()`. AuthGuard zet `req.accessToken` na verify. 13 services gemigreerd: Menu/Reviews/Guests/Reservations/Occupancy/Kpi/Campaigns/Suggestions/Chat/ChatMemory/Restaurant/DataExport/Weather/RestaurantContext. **Bewust op service_role gebleven**: AuditLog (audit-integriteit), Anonymization (background), AccountDeletion (raakt auth.users), Onboarding (restaurant_users-link bestaat nog niet), AiService (alleen ai_usage-logging), TeamService (gebruikt auth.admin.inviteUser/generateLink). RLS-tests bewezen op DB-niveau: cross-tenant SELECT → `[]`, cross-tenant INSERT → HTTP 403 + `new row violates row-level security policy`.
- [ ] **`@RequireModule`-decorator** — backend enforced per-module permissies (nu alleen frontend-filter op sidebar)
- [x] ~~**Audit-log vullen**~~ (2026-04-30) — alle 6 service-domeinen schrijven nu naar `audit_log` met echte `userId`. Zie Data Analyst-sectie voor exhaustief overzicht.
- [ ] **Email-change flow** — account-pagina
- [ ] **2FA setup** — `users.two_factor_enabled` kolom bestaat, geen UI
- [ ] **Pre-onboarding rate-limit naar Redis** — nu in-memory Map in `OnboardingController`. Overleeft geen multi-instance deploy; vervangen door Redis/Upstash zodra api op Railway schaalt.
- [x] ✅ **Server-side keys verwijderd uit `get-filly-web` Vercel-env-vars** (2026-06-18 door Floris; geverifieerd: alleen `NEXT_PUBLIC_*` + publieke OAuth-id's resteren). _Oorspronkelijke context:_ (gespot 2026-05-28 tijdens Vercel-migratie). Frontend-project heeft 9 server-only vars die er niet horen: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (⚠️ service-role, kritiek), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `GOOGLE_PLACES_API_KEY`, `WEB_URL`. Risico: als een per-ongeluk-gebakken Next.js-bundle ze lekt → full DB-access (SUPABASE_SECRET_KEY = bypass RLS) + open AI/mail-quota's. Mag BLIJVEN: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Stappen: dashboard → get-filly-web → Settings → Env-vars → 9× delete → redeploy zonder cache → testen.
- [x] ~~**Demo basic-auth-popup verwijderd**~~ (2026-05-29) — de `DEMO_AUTH_USERNAME/PASSWORD`-popup is uit `middleware.ts` gehaald zodat Google's reviewers de publieke pagina's + OAuth-flow kunnen bereiken (vereist voor GBP OAuth-verificatie). Dashboard blijft beschermd via de Supabase-auth-gates. **Restje**: `DEMO_AUTH_*`-env-vars staan nog in Vercel `get-filly-web` en kunnen verwijderd worden (code leest ze niet meer).

### Email & campagnes (gepromoveerd van P2 → P1)
- [ ] **Resend als SMTP-provider voor Supabase Auth** — configureer Resend onder Supabase Auth → SMTP Settings. Lost de 3-4/uur rate-limit op Supabase default SMTP en maakt confirmation-email weer bruikbaar in dev. Onze custom templates blijven werken; Supabase stuurt ze via Resend i.p.v. eigen SMTP.

### Campagne-flow cleanup (post-unification, 2026-05-13)
Sinds [main 61d26ed](https://github.com/Florisbwkoevermans/get-filly/commit/61d26ed) heeft `/campagnes/[id]` één gedeelde detail-view (status-aware) die identiek is aan `/voorstel/[id]`. Mig 0041 + 0042 zijn live, smart-detect op bundle-API werkt, 5 gedeelde componenten in `_components/campaign-detail/`. Hieronder de openstaande punten uit de data-analyst-review.

**Bugs (urgent):**
- [x] ~~**IG "handmatig verwijderen"-label ook op de overzichtskaart**~~
      (vervallen 2026-09-25) — Instagram-posts worden nu gewoon verwijderd bij
      het stoppen, dus het label is geen standaardgeval meer. Blijft alleen
      staan als vangnet wanneer verwijderen écht mislukt, en dan toont de
      stop-popup het meteen.
- [x] ~~**"Activeer nu" stuurt mail niet daadwerkelijk**~~ (2026-05-28) — `handleStatusChange('actief')` op `/campagnes/[id]` roept nu `sendCampaign(channelId, 'all_opted_in')` aan voor elke mail-channel met `sent_count=0`, dáárna pas de status-flip. Volgorde send-first → status-flip zorgt dat status op concept/ingepland blijft als de send faalt (geen 'actief zonder mail'-toestand). `sent_count>0` = defensief skip tegen dubbele bezorging. Confirm-tekst aangepast aan single/multi/no-mail-bundle.
- [x] ~~**InhoudCard `originalIdxRef` reset niet**~~ (✅ 2026-06-25, `ee404d7`) — reset nu in een effect gekeyd op `sectionId`; ✕ revert niet meer naar de variant van de vorige campagne.
- [~] **Multi-channel status-overgang heeft geen rollback** — (✅ deels 2026-06-25, `ee404d7`) de activeer-flow flipt nu per kanaal de status direct na zijn eigen geslaagde send/publish, met fout-attributie → geen "alles-of-niets-Promise.all" meer en geslaagde kanalen blijven actief bij een deelfout. **Rest open:** een echt transactioneel `PATCH /campaigns/bundle/:id/status`-endpoint (DB-niveau atomair over alle siblings).

**Dead code (na refactor niemand importeert het meer):**
- [x] ~~**4 components slopen**~~ (✅ 2026-06-22) — alle 4 verwijderd (~57 KB): `campaign-refine-panel.tsx`, `campaign-schedule-panel.tsx`, `campaign-media-slot.tsx` (vervangen door `campaign-detail/foto-card.tsx`; alleen comment-refs restten) + `campaign-send-modal.tsx` (de "Activeer-stuurt-mail"-fix is af; alleen comment-refs in google-connect-modal). Geverifieerd: nergens geïmporteerd. Typecheck schoon.
- [x] ~~**Dode API-functies in `apps/web/src/lib/api.ts` schrappen**~~ (✅ 2026-06-22) — `fetchCampaignVariants`, `generateCampaignVariants`, `updateCampaign`, `suggestCampaignSchedule` + de enkel-daar-gebruikte `CampaignVariantsState`-type verwijderd. Werden alleen door de net-gesloopte panels aangeroepen. `setCampaignSchedule`/`generateMoreCampaignVariants`/`updateCampaignStatus` (live) bewust behouden.
- [x] ~~**Dode backend-endpoints + service-methodes schrappen**~~ (✅ 2026-06-22) — `GET /campaigns/:id/variants`, `POST /:id/refine`, `PATCH /:id`, `POST /:id/suggest-schedule` uit de controller + `getVariants`/`refine`/`update`/`suggestSchedule` uit de service (~635 regels). Geverifieerd: enkel door hun eigen dode routes aangeroepen, geen gedeelde helpers (`retractFromChannel`/`syncContentFromVariant` blijven, live). Stale comments opgeschoond; `tsc` schoon. NB: `refine` was de laatste write-path naar `filly_variants` → zet mig-0043-cleanup een stap verder (zie hieronder).
- [x] ~~**Oude `/campagnes/bundle/[id]/page.tsx` slopen**~~ (2026-06-11) — redirect-stub + `bundle/`-map verwijderd; oude bookmarks worden nu server-side afgevangen via `redirects()` in `apps/web/next.config.ts` (307 naar `/dashboard/campagnes/:id`, bewust niet permanent gecached).
- [x] ~~**Mig 0043 → 0060: DB-schema cleanup**~~ (✅ 2026-06-22, code-stap) — laatste write-paden naar `campaigns.filly_variants`/`_regen_count`/`variant_applied_at` verwijderd (de create-seed + de hele `seed_variants`-keten in `campaigns.service`/`suggestions.service`) + de twee `variant_applied_at`-typevelden (api + web). Niets leest/schrijft de kolommen nog (`reviews.*`-kolommen blijven, andere tabel). Drop-migratie `0060_drop_campaign_filly_variants.sql` klaargezet. ⚠️ **Volgorde**: eerst deze code live, dán de DROP-SQL draaien (expand/contract).

**Polish (nice-to-have):**
- [x] ~~**Approve-redirects consistent**~~ (✅ al gedaan, bevestigd 2026-06-22) — de approve-handlers in `campagnes/page.tsx` (regels ~636/687) én de single-channel approve in `voorstel/[id]` (567) redirecten al naar `/dashboard/campagnes/${campaignId}`. Alleen reject/delete + multi-channel-bundle gaan bewust naar de kanban (bij een bundle is er geen één-correct detail-page).
- [x] ~~**"Wanneer plaatsen"-card: verzendmoment-uitleg herbedraden**~~ (✅ 2026-06-22, optie a+) — bij approve schrijven we nu het door het brein gekozen moment + reden (`sc.scheduled_for`/`scheduled_reasoning`, per kanaal in de bundel) in de bestaande `suggested_scheduled_for`/`_reasoning`-kolommen (`campaigns.service.create` + beide approve-paden in `suggestions.service`). De card (`wanneer-card.tsx`) rendert die al ("Filly stelt voor: … omdat …" + afwijking-banner + terug-naar-Filly) — geen card- of adapter-wijziging nodig. Geen migratie (kolommen bestonden al). De `approveBundleSuggestion`/chat-bundle-flow heeft geen per-kanaal-timing en blijft ongemoeid.
- [ ] **Variant-delete knop** — eigenaar kan via "Genereer 3 nieuwe" tot 6 versies opbouwen, daarna zit-ie vast. Voeg ✕-knop op alternatief-blokken (alleen op concept) toe → `DELETE /campaigns/:id/variants/:idx`.
- [ ] **`findBundle` N+1 → batch** — per content-tabel 1 SELECT met `IN (campaign_ids)` ipv `findById` per kanaal. *(bewust uitgesteld 2026-06-25: al parallel, ≤6 kanalen, geen reële last; batch-`IN` pas nodig bij >10-kanaal-bundels.)*
- [ ] **KanalenCard add/remove voor concept-bundles** — staat nu `canEdit=false` omdat de backend geen "add channel to bundle"-endpoint heeft. Vereist nieuw `POST /campaigns/bundle/:id/channels` dat een nieuwe campaign in dezelfde group_id aanmaakt.

### Site-fundamenten (publieke site)
- [x] ~~**Contact/waitlist-formulier**~~ (2026-05-30) — `/contact`-pagina (demo-aanvraag: naam/restaurant/e-mail/telefoon-optioneel/bericht + honeypot anti-spam). Publiek endpoint `POST /api/public/contact` (@Public) → `MailService.sendContactRequest` mailt naar **info@get-filly.com** (from `social@get-filly.com`, reply-to = bezoeker). Alle 5 demo/kennismaking-CTA's (navbar, homepage-hero, homepage-pijler, product, pricing) linken nu naar `/contact`. Serverside-validatie + lengte-grenzen.
- [x] ~~**404-pagina**~~ (2026-06-05) — `apps/web/src/app/not-found.tsx`, on-brand met links terug de site in
- [x] ~~**sitemap.xml**~~ (2026-06-05) — `apps/web/src/app/sitemap.ts`, live op `/sitemap.xml`
- [x] ~~**robots.txt**~~ (2026-06-05) — `apps/web/src/app/robots.ts`, blokkeert dashboard/auth/besloten routes
- [x] ~~**OG-image + per-pagina SEO-metadata**~~ (2026-06-05) — metadataBase + title-template + per-pagina title/description/canonical via `apps/web/src/config/seo.ts`; site-brede OG-deelafbeelding (alleen logo) via `app/opengraph-image.tsx`; JSON-LD (Organization/WebSite/SoftwareApplication) via `components/structured-data.tsx`. Canoniek domein **www.get-filly.com**.
- [x] ~~**Apex → www redirect**~~ (2026-06-06) — opgelost **in code** via `apps/web/next.config.ts` `redirects()` met host-match (`get-filly.com` → `https://www.get-filly.com`, 308). Heft de duplicate-content op én zorgt dat OAuth-redirect_uri's altijd op www staan (1 origin in Meta i.p.v. apex+www). Exact-host-match, dus app.get-filly.com + Vercel-previews vallen erbuiten. Optioneel nog: dezelfde redirect op Vercel → Domains zetten (gebeurt dan op edge, vóór de functie) — niet nodig, code dekt het.
- [ ] **Google Search Console** (open, Floris-actie + kleine code-stap) — property op `https://www.get-filly.com` aanmaken + `sitemap.xml` indienen. Verificatie via DNS-TXT óf meta-tag; bij meta-tag levert Floris de code aan → toevoegen als `verification: { google: "<code>" }` in de root-metadata (`apps/web/src/app/layout.tsx`).
- [ ] **Bing Webmaster Tools** (open, Floris-actie) — property op `www.get-filly.com` + dezelfde `sitemap.xml` indienen; voedt ook andere zoek-/AI-engines.
- [~] **Beeldoptimalisatie** (✅ grotendeels 2026-07-07) — `next/image` (AVIF+WebP via `next.config` `images.formats` + srcset + lazy-load) op de zware statische foto's: about-1/2/3.jpeg (~500KB elk, 1536px) + product `instagram-gerechten.jpg` (253KB) via `fill` in hun bestaande `aspect-ratio`/`object-fit:cover`-containers. `logo.png` verkleind **511KB → 124KB** (900×290; wordt alleen in OG-image + JSON-LD gebruikt, navbar/footer draaien op `logo.svg`). **Bewust NIET omgezet:** OG-`<img>` (kan niet in `ImageResponse`), navbar/footer/landing-phone (SVG-vector), landing-visuals (al 7-15KB), foto-card + tiktok-panel (dynamische signed/blob-URL's in het dashboard). **Rest open:** Lighthouse-audit o.b.v. Speed Insights.
- [x] ~~**FAQPage-schema op /pricing**~~ (2026-06-05) — JSON-LD uit de `faqs`-array → kans op uitklapbare rich results in Google.
- [~] **Analytics + Speed Insights** (2026-06-05) — code staat live in de root-layout (cookieloos/AVG-vriendelijk). **Speed Insights is actief** (script 200). **Web Analytics nog aanzetten**: Vercel → project → tab **Analytics** → *Enable* (script geeft nu 404 = uit). Daarna stroomt bezoekersdata binnen.
- [ ] **Social-profielen in JSON-LD `sameAs`** — ⏳ **wacht alleen op de URL's van Floris** (Instagram/LinkedIn + evt. Facebook/TikTok/X). Daarna ~5-min ingreep: invullen in de nu lege `sameAs:[]` in `components/structured-data.tsx` → sterkere entiteitskoppeling voor Google + AI-zoekmachines. (Bevestigd 2026-06-08: `sameAs` staat live nog leeg.)
- [x] ~~**About-pagina invullen**~~ (afgevinkt 2026-06-11) — `/about` is volledig gevuld (missie "Van idee naar impact" + 3 pijlers + roadmap 2026-2029) en live geverifieerd op www.get-filly.com/about.
- [x] ~~**Footer invullen**~~ (afgevinkt 2026-06-11) — `components/footer.tsx` heeft 3 kolommen (Product/Bedrijf/Juridisch) + logo + copyright; live geverifieerd.

### Content & blog (grootste SEO/GEO-hefboom)
- [x] ~~**Blog-/content-infrastructuur bouwen**~~ (2026-06-08) — `/blog` (index) + `/blog/[slug]` (detail, SSG, `dynamicParams=false`) live. Posts = markdown in `apps/web/content/blog/*.md` met front-matter (title/description/date/author); content-laag `src/lib/blog.ts` (parser + `marked`). Per artikel: SEO-metadata via `pageMetadata` + `BlogPosting` JSON-LD; automatische opname in `sitemap.ts`. Lege staat: `/blog` toont "binnenkort" + `noindex` zolang er geen posts zijn (en blijft dan uit de sitemap). Sjabloon: `content/blog/_template.md` (bestanden met `_`/`.` worden genegeerd). **Posten = `.md`-bestand droppen.** Nav-link "Blog" staat in de header (2026-06-08, op verzoek) — tot de eerste post toont `/blog` een "binnenkort"-staat + `noindex`. **Update 2026-06-17**: de lege staat is nu een volwaardige kennishub-layout **"De marketing cocktail"** (uitgelicht pijler-artikel + 6 kernpunt-kaarten + "Meest recent"), `app/blog.css` + `app/blog/blog-index.tsx`. Kaarten tonen een "binnenkort online"-toast en worden vanzelf echte links zodra een artikel met die `slug` bestaat. Eerste te schrijven slugs: `seo-tips-restaurant` (pijler), `vindbaarheid-geen-toeval`, `consistente-gegevens`, `compleet-profiel`, `fotos-meer-bezoek`, `recente-reviews`, `structureel-posten`.
- [x] ~~**Interne linking — lichte pass**~~ (2026-06-08) — contextlinks toegevoegd in de paginatekst: Over ons → Oplossing ("onze oplossing voor restaurants") + Prijzen; Oplossing → Prijzen; Prijzen → Oplossing; Home → Prijzen; en **Blog** toegevoegd aan de footer. (Footer dekte de sitebrede links al goed.) **De echte hefboom — 3-5 contextlinks/pagina in topic-clusters — volgt met blogcontent**, niet forceren op de marketingpagina's.
- [ ] **Eerste artikel-onderwerpen** (aangeleverd door Floris, 2026-06-05):
  - "Hoe krijg ik meer reserveringen in een rustige periode?"
  - "Google Bedrijfsprofiel optimaliseren voor je restaurant"
  - "Reviews beantwoorden als horecaondernemer"
  - "Restaurantmarketing zonder bureau"

### Off-site autoriteit & GEO (AI-vindbaarheid)
- [ ] **Off-site autoriteit / backlinks** (Floris/marketing, doorlopend) — Google Bedrijfsprofiel voor Get-Filly zélf, vermeldingen in horeca-/SaaS-directories + NL-startuplijsten, gastblogs/partnerships/persaandacht.
- [~] **GEO — eigen site voor AI-zoekmachines** — `llms.txt` ✅ gebouwd (2026-06-08, `public/llms.txt`: samenvatting + kernpagina's voor ChatGPT/Claude/Gemini/Perplexity); robots.txt laat AI-crawlers al toe via `userAgent:*`. **Nog te doen**: heldere feitelijke 'Wat is Get-Filly'-/vergelijkingscontent (sluit aan op blog-infra), evt. `/llms-full.txt`, en de `sameAs`-profielen (zie hierboven).
- [x] ~~**Wekelijkse interne AI-vindbaarheid-mail (Filly → Get-Filly over get-filly.com)**~~ (2026-06-08, gebouwd) — `apps/api/src/seo-report`: Vercel Cron (`apps/api/vercel.json` → `crons`, `0 5 * * 1` = ma 07:00 Amsterdam in de zomer / 06:00 in de winter — Vercel-cron kent geen DST) → `GET /api/seo-report/run` (publiek, beveiligd met `CRON_SECRET` via `Authorization: Bearer`) → audit over **4 pijlers**: AI-zoekmachines, klassieke SEO (per pagina title/description/H1/canonical/og:image/JSON-LD + /llms.txt /robots.txt /sitemap.xml), **eigen Google Business** (rating + #reviews via Places API v1, env-gated op `GETFILLY_PLACE_ID` + `GOOGLE_PLACES_API_KEY`) en algehele internetvindbaarheid → korte Claude-analyse (Haiku, feature `seo_weekly_audit`, restaurantId null) met score + kansen per pijler + top-3 acties → HTML+text-mail via `MailService.sendSeoReport` naar info@get-filly.com. Fail-soft. Lean i.v.m. 10s-functielimiet. **⚠️ Vereist (Floris-actie):** `CRON_SECRET` in Vercel `get-filly-api` (`openssl rand -hex 32`) + redeploy. **Optioneel:** `GETFILLY_PLACE_ID` voor de Google-Business-sectie (anders "niet gekoppeld").
- [ ] **Per-klant vindbaarheid-mail/-check** (later, op verzoek) — zelfde idee maar per restaurant naar de eigenaar (Google Business + eigen site). Bouwt voort op de bestaande Health-score-runner (`/dashboard/google-business/audit`). Eerst de interne mail af, dan dit per-tenant uitrollen.

### Foto-tool ("Filly Beeld-studio") — ligt klaar op een branch
Eén bronfoto die Filly per kanaal in het juiste formaat zet. Backend én UI
staan op de lokale branch `feat/foto-tool-infra` (één commit, `cd2edd1`,
~1975 regels: `api/src/image/`, `beeld-studio.tsx`, api-laag, NL/EN-teksten).
Het UX-voorstel is te bekijken op `/proto-fototool`.

- [ ] **De branch is 75 commits achter op `main`** en raakt bestanden die
      sindsdien veranderd zijn (`lib/api.ts`, `messages/{nl,en}.json`,
      `campaign-detail/foto-card.tsx`). Eerst bijwerken, dan pas kijken of 'ie
      nog werkt.
- [ ] 🔴 **Migratienummer botst.** De branch brengt
      `0071_image_usage.sql` mee, maar 0071 is op main al
      `0071_campaign_performance_per_channel.sql`. Hernummeren naar het
      eerstvolgende vrije nummer vóór er iets gedraaid wordt.
- [ ] **Staat niet op `origin`.** De branch bestaat alleen op deze laptop; er
      is geen kopie. Pushen zou dat oplossen.
- [ ] De API-sleutel voor de beeld-provider ontbreekt nog.

### Documenten die er nog niet zijn
- [ ] **`docs/security-measures.md`** — de verwerkersovereenkomst
      ([`docs/legal/dpa-template.md`](docs/legal/dpa-template.md)) beloofde een
      actuele lijst technische en organisatorische maatregelen "op aanvraag",
      maar dat document bestond niet. De belofte is er voorlopig uit gehaald;
      een klant die erom vraagt heeft 'm wél nodig. Inhoud: versleuteling in
      transit en at rest, toegangsbeheer, logging, back-ups, incidentprocedure,
      sub-verwerkers.
- [ ] **`docs/data-classification.md`** — per tabel welke categorie gegevens
      erin staat. Hoort bij fase 2 van de anonimisering (zie P1 hierboven) en
      wordt óók vanuit de DPA genoemd.

### Opgezette plannen die nooit zijn uitgevoerd
Deze vier stonden in `docs/` alsof ze beschreven hoe het werkt. Dat deden ze
niet — het waren voornemens. De uitgewerkte stappen staan in
[`docs/archief/`](docs/archief/), hier staat alleen de beslissing die nog open is.

- [ ] **Sentry of een alternatief voor error-tracking.** Productiebugs worden nu
      pas zichtbaar als iemand mailt. Geen `@sentry`-pakket geïnstalleerd.
      → [`docs/archief/sentry-setup.md`](docs/archief/sentry-setup.md)
- [ ] **Staging-omgeving.** Een push naar `main` is nu meteen productie. Werd
      destijds opgezet voor de Meta-review; die is inmiddels rond, dus de vraag
      is of het nog moet. → [`docs/archief/staging-setup.md`](docs/archief/staging-setup.md)
- [ ] **Migraties via de Supabase CLI.** Het plan was `pnpm db:migrate`; dat
      script bestaat niet en migraties gaan nog handmatig door de SQL Editor.
      Werkt prima, maar is wel een enkel punt van falen: vergeten = stille
      productiebug. → [`docs/archief/database-migrations.md`](docs/archief/database-migrations.md)
- [ ] **Kostenplafond + alerts op de Anthropic-console.** Of dit ingesteld is,
      is van buiten de console niet te zien — even nakijken.
      → [`docs/archief/anthropic-cost-alerts.md`](docs/archief/anthropic-cost-alerts.md)

---


## P2 — Mock-features naar echt

### Campagne-concept-UX (ideeën vanuit Floris-ronde 2026-04-24)
- [~] **3 varianten genereren per suggestie** — gedaan 2026-04-25. Filly genereert 3 versies per chat-proposal, modal toont ze naast elkaar met selectie + refine + goedkeuren. Approve gebruikt geselecteerde variant.
- [x] ~~**Media-upload op concept-campagne**~~ (afgevinkt 2026-06-11) — bestaat al: FotoCard op de unified detail-pagina + `MediaLibraryPicker` (eigen foto uploaden óf kiezen uit eerdere afbeeldingen, drag-and-drop). Precies wat dit item vroeg.
- [ ] **Bewerken-knop onder variant i.p.v. rechtsboven** — intuïtiever als de actie visueel bij de gekozen variant hoort.

### Filly AI-features (backend + prompts)
- [x] ~~Review-reply-suggesties via Claude~~ (2026-04-23, commits `bd03246` + `21314d9`)
- [x] ~~Filly-chat v1 met persistente historie~~ (2026-04-23, commit `53db975`)
- [x] ~~Filly-chat v2 met live restaurant-context~~ (2026-04-23, commit `0f0e1b3`)
- [x] ~~Website-analyzer (crawl + Claude) voor profiel-extractie~~ (2026-04-24, commit `b29f317`)
- [x] ~~Menu-importer met Claude Opus 4.7 Vision~~ (2026-04-24, commit `b29f317`) — verwerkt PDF/JPG/PNG/WebP, max 10MB
- [x] ~~Menu-uploads tabel + Storage-bucket met RLS~~ (migratie 0011, 2026-04-24). **NB**: onboarding-uploads gaan direct naar Vision zonder Storage-stop; pas bij heropen via menu-pagina (nog te bouwen) gebruiken we de bucket echt.
- [x] ~~**Suggesties-generator** — `getMockProposal()`~~ (2026-04-30) — vervangen door echte Claude-call via tool-use. `SuggestionsService.getProposalDetails()` levert mainDish/sides/timing/bundle-prijs/heroImage op basis van profile + menu, gecachet in `suggested_campaign.proposal_details`. Frontend laadt via `GET /api/suggestions/:id/proposal-details` met loading-skeleton.
- [x] ~~**On-demand suggesties-generator** — "Vraag Filly om voorstellen"-knop op /campagnes~~ (2026-04-30) — `SuggestionsService.generateOnDemand()` bouwt context (profile + menu + live-block) → Claude tool-use → 3-5 nieuwe ai_suggestions met trigger_type-enum (low_occupancy/weather/seasonal/retention/birthday/general). Werkt vanaf seconde 1 na onboarding zolang ≥3 menu-items. Vervangt het cron-vraagstuk: eigenaar drukt knop wanneer hij wil ipv passief wachten op auto-trigger.
- [x] ~~Menu CRUD endpoints~~ (2026-04-29) — POST/PATCH/DELETE op `/api/menu` live + menu-pagina aangesloten. Filly ziet nieuwe gerechten direct in z'n volgende prompt. **Nog open**: opnieuw uploaden menukaart via menu-pagina (mock-flow blijft alleen lokaal).
- [x] ~~**Prompt caching activeren**~~ (2026-04-29) — `cache_control: ephemeral` actief in `AiService` op chat + campaign-refine + reviews-refine. Plus per-2026-04-30: ook gebruikt voor proposal-details + on-demand suggesties + low-occupancy detect.
- [x] ~~**Auto-title-generation voor chat-conversations**~~ (2026-04-30) — `ChatService.maybeGenerateTitle` fire-and-forget na elke user-msg. Drempel: ≥3 user-messages + title is null. Tool-use Claude-call (Haiku 4.5, ~€0,001/call) genereert NL-titel ≤60 tekens. Race-safe schrijven via `.is('title', null)`. Conditioneel logger.warn bij falen — chat-response gaat altijd door.
- [x] ~~**Tool-use migratie voor alle Filly-flows**~~ (2026-04-30) — alle 5 plekken die voorheen `JSON.parse(claude.text)` deden gemigreerd naar Anthropic tool-use met expliciete JSON-schema's. Geen "Kon Filly's antwoord niet lezen"-fouten meer mogelijk. Geraakt: website-analyzer, menu-importer, campagne-refine (3 varianten), suggestion-refine, reviews-refine, schedule-suggestion. `AiService.generateStructured<T>` + `generateStructuredFromFile<T>` als centrale wrappers. Vision-calls gebruiken streaming-API (`messages.stream().finalMessage()`) zodat 24k-cap-bij-Opus geen 10-min-pre-flight-blokkade veroorzaakt.
- [x] ~~**Drankkaart-upload via Vision**~~ (2026-04-30) — aparte flow naast menukaart. `MenuImporterService.analyze(file, meta, kind)` met `kind='menu'|'drinks'`. Drank-tool-schema dwingt subcategory-enum af (wijn-rood/wit/rose/mousserend, bier, cocktail, sterke-drank, koffie-thee, fris). UI: 2 banners + signed-URL-link op bestandsnaam. Migraties 0024 (`menu_items.subcategory`) + 0025 (`menu_uploads.kind`).
- [x] ~~**Lage-bezetting-detect-and-generate**~~ (2026-04-30) — alert-bar bovenaan dashboard heeft nu actie-knop. `SuggestionsService.detectAndGenerateLowOccupancy()` window 2-14 dagen, drempel <50%, per-dag Claude-call met dag-context (weekdag, weer, segment-counts). Skip-regel: dagen met al pending suggestie worden overgeslagen. POST `/api/suggestions/detect-low-occupancy`.
- [x] ~~**Variant-flow + schedule-cyclen**~~ (2026-04-30) — migratie 0026: `campaigns.variant_applied_at` + `scheduling_history`. Suggestion-detail-modal gebruikt echte Claude-call voor proposal_details (geen mock meer). Approve-flow geeft chat-varianten door als seed naar campaigns.filly_variants zodat detail-pagina geen tweede generation triggert (3+3=6 max). Schedule-suggestie-knop cyclet door history na 4 unieke alternatieven. Inplannen + Plaats nu/Activeer-knoppen op detail-pagina header.
- [ ] **Platform-specifieke output per social-media-post** — bepalen wat voor output Filly per kanaal moet leveren, zo compleet mogelijk: per platform (Instagram feed, Instagram Reels, Instagram Stories, Facebook post, TikTok, LinkedIn) de juiste **caption-lengte** (IG ~125 tekens optimum, FB tot 80 woorden, TikTok 100-150, LinkedIn 150-300), **hashtag-strategie** (IG 3-5 mix branded+niche, TikTok 3-5 trending+specific, FB minimaal/geen, LinkedIn 3 max professioneel), **foto-/video-formaten** (IG 1:1 of 4:5, Reels 9:16, Stories 9:16, FB 1.91:1, TikTok 9:16, LinkedIn 1.91:1 of 1:1), **tone** (IG visueel-persoonlijk, FB community-conversational, TikTok energiek-trending, LinkedIn professioneel-storytelling), **call-to-action stijl** (IG "link in bio", FB direct link, TikTok "swipe up" of "comment", LinkedIn discussie-vraag), **emoji-density**, **mention-/tag-strategie**, **alt-text-vereisten**, **publicatie-tijdstip per platform** (zit deels al in suggestSchedule maar moet platform-specifiek). Resultaat: tool-schema + system-prompt per `campaign_type` + nieuw veld `social_platform` (instagram/facebook/tiktok/linkedin) zodat Filly weet voor welk kanaal hij genereert. Eigenaar kiest platform tijdens campagne-aanmaak; UI gebruikt verschillende preview-rendering per platform.

### Health-score v1 live (2026-05-23) — V2-roadmap
- [x] ~~**v1 live**~~ (2026-05-23) — `/dashboard/google-business/audit` (route hergebruikt, was Profiel-audit). 4 runners (SEO/GBP/Reviews/GEO) + CompetitorCollector in 500m straal. Gewichten: GBP 30 / SEO 25 / Reviews 25 / GEO 20. Score 0-100 met sub-scores, acties-lijst gesorteerd op pointsLost, concurrent-tabel, trend-grafiek, tabs-UI met deep-dive per categorie. POST /health/run + GET /health/latest + /health/history. Migratie 0045. Volledige analyse-uitleg in `docs/werking/health-score-analyse.docx` (12 hoofdstukken, kritische bedenkingen per categorie). Geen extra API-key nodig: hergebruikt `GOOGLE_PLACES_API_KEY` + Claude `ANTHROPIC_API_KEY` + PageSpeed werkt gratis tot 25k/dag/IP.
- [ ] **SEO-keyword-suggesties via Claude** — extra Claude-call in SeoRunner die op basis van current title/meta/H1 + restaurant-info verbeterde versies suggereert. "Welkom" → "Bistro X — Frans-Hollandse keuken in Utrecht Centrum". UI: deep-dive in SEO-tab. ~€0,002 extra per audit.
- [ ] **GBP volledige Place-velden-checklist** — alle Place-data (telefoon, adres, openingstijden, categorie) tonen met huidige waarde + status, naast de bestaande 8 checks. Data is al beschikbaar in `GoogleProfileService.getMine()`; alleen runner + UI uitbreiden.
- [ ] **Reviews sentiment-analyse** — Claude-call op review-tekst om top-3 onderwerpen (positief/negatief) te extraheren. **Wacht op**: GBP-API met OAuth (Places API New geeft geen review-lijst meer). Of vooralsnog op handmatig in Filly ingevoerde reviews.
- [ ] **Recency-check op reviews** — laatste review jonger dan 60 dagen. Wacht op zelfde OAuth-flow als sentiment.
- [ ] **Antwoord-ratio op reviews** — % reviews dat eigenaar beantwoord heeft. Wacht op GBP-API.
- [ ] **GEO-bronnen uitbreiden** — Perplexity API (~€5/maand bij ons volume, gebruikt web-search), OpenAI GPT-search, Google AI Overviews-detectie. Diversificeert van alleen-Claude naar drie engines. Gewichten herzien naar 1/3 elk.
- [ ] **Keyword-ranking via DataForSEO/SerpAPI** — echte SERP-posities voor 5-10 zoekwoorden per restaurant. ~€20-50/maand per klant. Pas activeren als klanten erom vragen.
- [ ] **PageSpeed gemiddelde over laatste 3 runs** — PSI is flakey (zelfde site krijgt soms 65, soms 78). Tonen we nu pure last-run; v2 gemiddelde voor stabielere score. UI alleen, geen backend-werk.
- [ ] **Configureerbare concurrent-straal** — slider 250m-1km op de health-score-pagina. Default 500m. Backend `CompetitorCollector.collect()` parametriseren.
- [ ] **runner_version-overgang in trend-chart** — verticale lijn waar versie wisselde, zodat historische score-sprongen geen mysterieuze "wat gebeurde er?"-vraag worden.

### Filly's denkmethodiek — investor-document
- [x] ~~**Writing-styles & beslissingsraamwerk uitschrijven (Word-document)**~~ (2026-05-24) — `docs/werking/filly-brein.docx` v1 live met 24 hoofdstukken: input-signalen + redeneer-flow + 6 kanaal-secties (mail/IG/FB/TikTok/WA/GBP) met lengte/tone/hashtags/timing/CTA/visueel + critic-stem + bronnen (Sprout Social, Hootsuite, HubSpot, Later, Litmus, BrightLocal, Whitespark) + urgentie-vs-optimum-framework + anti-repetitie-mechanisme + performance-tracking-leerloop + funnel/lifecycle + segmentatie/targeting + content-types/UGC + brand-stem-archetype + AI-risico's + operationele rails + complete website-implementatie-checklist. Investor-ready in dezelfde stijl als health-score-analyse.docx.

### Filly-brein v2 → code-vertaling + website-implementatie (van filly-brein.docx)
**Het document `docs/werking/filly-brein.docx` is de bron-van-waarheid voor onderstaande taken. Open dat eerst.**

#### Filly-brain config + prompts (geen externe afhankelijkheden)
- [x] ~~**filly-brain.config.ts**~~ (2026-05-24) — typed `CHANNEL_RULES` voor 8 kanalen met copyLength/hashtags/bestTimes/leadTime/frequency/visual/tone/cta + `CHANNEL_MIX_PER_THEME` + `FUNNEL_STAGE_TO_CHANNELS` + `PERSUASION_EXAMPLES` (Cialdini 6) + `DEFAULT_RATE_LIMITS` + `SUCCESS_SCORE_THRESHOLDS` + `ANTI_REPETITION_THRESHOLDS`. Helpers `buildAllChannelsBlock` + `classifyLeadTime` + `planChannelPlacement` + `buildAnchorKeywords`. `CHANNEL_RULES_VERSION = 'v1'`.
- [x] ~~**System-prompts migreren naar config**~~ (2026-05-24) — chat.service.ts + suggestions.service.ts injecteren `buildAllChannelsBlock()` vóór CONTEXT-sectie; "VARIATIE OVER 3 VARIANTEN"-regels dwingen 3 verschillende tone-signatures af. Bestaande FORMAAT 1/2-templates blijven (centrale regels leidend bij conflict). Tool-schema-uitbreiding met `funnel_stage`/`tone_signature`/`length_target` nog open (vereist Anthropic tool-use migratie van bestaande text-blokken).
- [x] ~~**suggestSchedule met timing uit config**~~ (2026-05-24) — `mapCampaignTypeToChannel` + `formatTimingForPrompt` brengen bestDays/bestHours + lead-time + urgentie-regel uit filly-brain.config in de scheduling-prompt. Rustige dag = doel-datum, mag afwijken van sweet-spot bij dichtbije deadline. `planChannelPlacement()`-helper bestaat voor de volledige tijd_tot_doel-berekening zodra er een expliciete doel-datum-input is.
- [x] ~~**campaign_style_fingerprints-tabel**~~ (2026-05-24, mig 0048) — opening_pattern / hashtag_set / cta_template (enum) / theme / primary_dish_mentioned / tone_signature (enum) per kanaal. RLS via user_has_restaurant_access + restaurant_id-denormalize.
- [x] ~~**Anti-repetitie-context loader**~~ (2026-05-24) — `CampaignFingerprintService.buildLearningContextBlock()` laadt top-3 winners + top-3 underperformers per kanaal via JOIN met campaign_performance, plakt 'm in chat + suggestions-prompts als "SUCCESSFUL/AVOID PATTERNS". Anker-keywords-helper aanwezig in filly-brain.config maar nog niet actief gebruikt in similarity-check (komt bij anti-repetitie post-generation v2).
- [x] ~~**Post-generatie anti-repetitie-validatie**~~ (2026-05-24, hfst 8.6) — `CampaignFingerprintService.checkRepetition` + `checkForCampaign`: opening-overlap >60%, hashtag-Jaccard >70% (excl. anker), cta 2× op rij. GET /campaigns/:id/repetition-check + "Variatie-tip"-banner op detail-page. Geen auto-regenerate.
- [x] ~~**tone_signature per variant gevalideerd**~~ (2026-05-24, hfst 8.4) — `ProposalVariant.tone_signature` (enum), FORMAAT 1-prompt verplicht 3 verschillende, sanitizeVariant valideert, observability-warning bij niet-uniek. Filly labelt tone nu zelf.
- [x] ~~**Fingerprint v2: tone_signature + theme via Claude**~~ (2026-05-24, hfst 9.5) — `classifyToneAndTheme` Haiku-call bij approve, fail-soft → blijft v1 (null). Wordt fallback nu Filly de tone zelf labelt.
- [x] ~~**Brein-dekking-fix: alle generatie-prompts krijgen kanaalregels**~~ (2026-06-11) — audit wees uit dat het brein op meerdere plekken níet in de prompt zat of door eigen hardgecodeerde regels werd tegengesproken. Gefixt: (1) campagne-refine + generateMoreVariants injecteren nu `formatChannelRulesForPrompt` op het echte kanaal (social → platform uit campaign_social_content); (2) chat-prompt: 3× eigen woordaantallen weg + dubbele FORMAAT 1-header weg + bug "variant 3 ~130% van max-lengte" (instrueerde Claude óver het maximum) gefixt; (3) suggesties: hardgecodeerde verzendtijden vervangen door nieuw `buildAllTimingBlock()` (BestTimes+lead-time per kanaal), lage-bezetting/speciale-dag/refine-prompts hadden helemaal géén brein en hebben dat nu wel. Commits `c0dd738` + `14ad635` + `c90e9e7`.
- [x] ~~**Lengte-validatie in code (post-generation)**~~ (2026-06-11, commit `70afd79`) — `checkCopyLength()` in filly-brain.config + nieuw `ai/copy-length.guard.ts`: `enforceCopyLength()` doet max 1 gerichte herschrijf met exacte teken-aantallen ("variant 2 was 1500 tekens, maximum is 700") en accepteert daarna het beste resultaat + warning-log (blokkeert nooit; retry hergebruikt de prompt-cache → ~10% input-tarief). Aangesloten op 5 routes: campagne-refine, generateMoreVariants, suggestion-refine, low-occupancy en speciale-dag (kanaal post-hoc uit Filly's gekozen type, type vastgehouden bij herschrijf). **Restje:** chat-flow heeft de guard bewust nog niet (latency-gevoelig) — log-only variant kan later.
- [x] ~~**Social-posting-brein (v1.1) → config-vertaling**~~ (2026-06-11, commit `b4f2e02`) — bestTimes/notes van alle 8 kanalen vervangen door de onderzoeksgedreven waarden uit het social-posting-brein-document (heette eerst "Timing Brein" / `Get-Filly-Posting-Tijden-v1_1.docx`; staat nu in de repo als `docs/werking/social-posting-brein.docx`. Buffer 9.6M posts, Sprout 307K profielen, MailerLite 2.1M campagnes, Dash Social, Toast). GBP-frequentie 2→3/wk. CHANNEL_RULES_VERSION v1→v2. **Bewust geskipt:** nieuwe kanalen TheFork/Zenchef/OpenTable (integraties bestaan nog niet; toevoegen zodra die koppelingen er zijn) en SEO/GEO (onderhoudsritme, geen posts).
- [x] ~~**Externe timing-factoren als deterministische code**~~ (2026-06-11, commit `d0dc8c6`) — nieuw `ai/timing-factors.ts`: NL-feestdagen (Pasen-afgeleiden via Meeus-algoritme, Koningsdag-zondagregel, Moederdag/Vaderdag) met Rabobank-omzetimpact + promo-lead-times (Kerst verschijnt al 8 wkn vooraf), loondag-vensters (25e+/1-5/vakantiegeld/13e maand), seizoens-context en weer-interpretatieregels. `buildExternalFactorsBlock()` geïnjecteerd in suggestie-prompts + verzendmoment-suggestie. Runtime-getest op 2026-data. **Restje:** evenementen-factor (hfst 4.3) — zie het plan hieronder.
- [x] ~~**Evenementen.nl-sync + staffel-matching gebouwd**~~ (2026-06-11, commit `f73b306`) — mig 0053 (events + event_places geocode-cache), wekelijkse sitemap-sync (Vercel Cron di 04:00, 6 XML-requests/run), plaats-resolutie via PDOK woonplaats-filter met exact-match-eerst + fuzzy-fallback, staffel-matching op afstand (kermis/markt 2 km, concert/sport/event 5 km, festival 10 km) en EVENEMENTEN IN DE BUURT-blok met framing-regels in de suggestie- + schedule-prompts. **Om live te zetten:** (1) mig 0053 draaien in Supabase SQL Editor, (2) pushen (cron registreert automatisch; CRON_SECRET bestaat al voor seo-report), (3) eerste runs handmatig triggeren (`curl -H "Authorization: Bearer $CRON_SECRET" <api>/api/events/sync`) — de plaats-resolutie is incrementeel (200 PDOK-lookups/run), na ±5 runs is de hele kalender resolved. ⚠️ maxDuration api-functie 10→60s in vercel.json.
- [x] ~~**Events-voorkeuren per restaurant (account-pagina)**~~ (2026-06-12, commit `e10b544`) — mig 0054: `event_categories` (checkboxes per type; null = alle, [] = events uit) + `event_max_distance_km` (2-25 km vast, of null = slimme staffel per type). EventsService filtert erop. ⚠️ **Mig 0054 éérst draaien in Supabase SQL Editor, dán pas deployen** — de account-pagina stuurt het hele form-object, dus zonder kolommen breekt opslaan voor iedereen.
- [ ] **Evenementen — vervolgstappen** (social-posting-brein hfst 4.3) — uit het oorspronkelijke plan van 2026-06-11:
  - **Fase 0 — schoolvakanties als code (quick win, geen data nodig):** Rijksoverheid publiceert de vakanties per regio (Noord/Midden/Zuid) per schooljaar; statisch genoeg om net als feestdagen in `timing-factors.ts` te zetten. Restaurant-regio afleiden uit provincie/lat-long. Familie-restaurants +8% in regio-vakanties (Rabobank).
  - **Fase 1 — events-tabel + handmatige invoer:** migratie `events` (name, type enum: festival/concert/sport/beurs/kermis/nationaal, starts_on/ends_on, lat+lng of pc4, city, expected_visitors?, source). Matching: restaurants hebben al lat/long (PDOK) → haversine-afstand → events <2km binnen 21 dagen → extra sectie in `buildExternalFactorsBlock()` met de lead-times uit het doc (concert/festival 5-10 dgn vooraf, sport 2-3 dgn, beurs 14-21 dgn naar zakelijk segment). Eigenaar kan eigen lokale events invoeren (kermis, braderie) via een klein UI-lijstje — die kent z'n buurt zelf het best.
  - **Fase 2 — bestaande Get-Filly evenementen-database importeren:** het doc noemt een interne database (189 lokale events per PC4 + 64 nationale, 455 plaatsen). ⚠️ **Die staat NIET in deze repo** — eerst met Floris bepalen waar die leeft (CRM? spreadsheet?) en als seed/import in de events-tabel laden.
  - **Fase 3 — automatische feeds via scheduled job:** Eredivisie/KNVB-speelschema (publiek, +15% lokale F&B <2km bij thuiswedstrijd), F1-kalender, beurskalenders RAI/Jaarbeurs/MECC, gemeentelijke open-data/evenementenkalenders (grote steden hebben feeds; dekking varieert). Dagelijkse sync, dedupe op (name, starts_on, city).
  - **Evenementen.nl als hoofdbron — verkend 2026-06-11:** ~13.000 NL-events in 6 categorieën (festivals 4.1k, markten 3.8k, events 2k, sport 1.3k, concerten/theater 1.2k, kermis 0.8k). Geen publieke API; wél een open sitemap-index (`/sitemap-events/*.xml`, robots.txt staat crawlen toe — alleen zoekpagina's verboden) en de **slugs bevatten al naam+plaats+datum** (`1-ander-festival-schijndel-2026-06-13`). Detail-pagina's zijn server-side gerenderd met venue-link (geen schema.org/Event JSON-LD). Plan:
    1. **Route 1 (eerst, parallel):** contact opnemen voor datafeed/licentie of partnership (site is gebouwd door komma.nl; er is een "Evenement aanmelden"-functie, geen API). ⚠️ Databankenrecht (NL): substantiële extractie van hun database zonder toestemming is juridisch risicovol — bulk-kopiëren mag niet zomaar, ook al is de data publiek.
    2. **Route 2 (licht + proportioneel tot er een afspraak is):** dagelijkse sync van alleen de 6 sitemap-XML's (6 requests/dag) → slugs parsen (plaats = langste match vóór de datum tegen NL-plaatsnamenlijst) → upsert in events-tabel met source + bron-URL → alléén voor plaatsen met Get-Filly-klanten de detail-pagina ophalen voor venue → PDOK-geocode → 2km-matching. Bronvermelding + link in de suggestie.
    3. Injectie via bestaande `buildExternalFactorsBlock()` met lead-times per type (festival 5-10 dgn, sport 2-3 dgn, beurs 14-21 dgn).
- [x] ~~**Lengte-hoofdstuk in brein-document genereren vanuit code**~~ (2026-06-11, commit `985cf5d`) — `pnpm brein:doc` (scripts/generate-brein-kanalen.mjs) genereert `docs/werking/social-posting-brein-kanalen.md` uit CHANNEL_RULES: overzichtstabel lengte-bandbreedtes + volledige sectie per kanaal. Code wijzigen → script draaien → hoofdstuk is bij; nooit handmatig bewerken.
- [ ] **Volledige tool-use migratie chat-proposals** (robuustheid) — van `<<FILLY_PROPOSE_CAMPAIGN>>`-tekstmarkers naar Anthropic tool-use voor gegarandeerde JSON-structuur. Hard afdwingen i.p.v. valideren. Grotere refactor van de live chat-flow; lagere prioriteit nu de tekst-validatie werkt.
- [ ] **Brand-archetype + do/don't-velden** (hfst 15) — nieuwe kolommen `restaurants.brand_archetype` (enum 12) + `brand_voice_do[]` + `brand_voice_dont[]`. UI in identiteit-tab. Filly krijgt ze als harde constraint in prompt.
- [ ] **B1/B2-taalniveau-instelling** (hfst 15.3) — `restaurants.language_level` enum. Default B1.
- [ ] **Cialdini-power-woorden-bibliotheek** (hfst 13.6) — opt-in lijst per restaurant; Filly verwerkt structureel scarcity/authority/social-proof als toepasselijk.
- [ ] **Filly stop-condities** (hfst 17.1) — checks vóór generation: menu-data aanwezig, tone_of_voice ingevuld, geen conflict met do_not_mention. Bij stop: heldere uitleg + actie-link.
- [ ] **Eigenaar-correctie-feedback-loop** (hfst 17.2) — na 3× zelfde patroon-correctie vraag "wil je dat ik dit voortaan standaard zo doe?". Opslag in brand_voice_do/dont.
- [ ] **Uitlegbaarheid-niveau-keuze** (hfst 17.5) — eigenaar kiest "diep" / "kort"; default kort. Toon herkomst-attributie bij elk voorstel.
- [ ] **Filly-zelfreflectie-score** (hfst 17.6) — na approve: "was dit direct goed?" 1-5 + open feedback. Opslag in ai_suggestions.post_approve_score.
- [ ] **Rate-limits per restaurant per kanaal** (hfst 18.1) — defaults uit doc-tabel, eigenaar mag overrulen. Filly weigert te genereren als limiet bereikt deze maand.

#### Triggered messaging-flows (vereist alleen Resend, geen Meta OAuth)
- [ ] **Welkom-mail-flow** (hfst 11.3) — direct na 1e reservering + reminder 24u vooraf.
- [ ] **Reviewverzoek-mail** — 24-48u na bezoek, QR-code op tafel als alternatief.
- [ ] **Verjaardag-uitnodiging** — 7 dagen vóór `guests.birthday`; mail of WhatsApp (opt-in).
- [ ] **Win-back-flow** — 90 dagen stilte trigger; persoonlijke uitnodiging met signature-gerecht-trigger.
- [ ] **Anniversary 1-jaar** — mooie milestone, geautomatiseerd op `guests.first_visit_at` + 365 dagen.
- [ ] **Lifecycle-classificatie** — auto-update `guests.computed_segment` dagelijks via pg_cron (nieuw / verse gast / terugkeerder / vaste / slapend / verloren).

#### Performance-tracking (deels nu, deels OAuth-afhankelijk)
- [x] ~~**campaign_performance-tabel**~~ (2026-05-24, mig 0046) — alle kanalen-kolommen (mail/social/whatsapp/gbp) nullable, plus reservations_attributed, success_score, classification, outlier-flag, measurement_complete_at. RLS via user_has_restaurant_access.
- [x] ~~**Resend webhooks uitbreiden voor campagne-mail**~~ (2026-05-24) — MailService.handleWebhook aggregeert delivered/opened/clicked/bounced auto in campaign_performance. Test-mails (send_mode='test') uitgesloten via mig 0049.
- [x] ~~**UTM-helper-functie**~~ (2026-05-24) — `apps/api/src/common/utm.ts` met `buildUtmUrl`, `slugify`, `defaultMedium`, `parseUtmFromUrl`, `addUtmToAllLinks` (idempotent). MailService.sendCampaign tagt nu auto alle URLs in body bij send-time.
- [ ] **Reservation-form-UTM-hook** (hfst 14.3) — `/reserveren?utm_*` URL-params doorgeven aan booking-form; bij submit `via_campaign_id` matchen op utm_campaign-slug en auto-zetten. Nu alleen handmatig via UI op /reserveringen.
- [x] ~~**Nightly performance-scoring-job**~~ (2026-05-24, mig 0047) — pg_cron daily 03:17 UTC roept `classify_campaign_performance()` PL/pgSQL-functie aan. Scoort mail-campagnes >14d oud via formule open_rate*30+click_rate*50+conv_rate*20.
- [x] ~~**Classify-drempels op afgeleide industry-baseline**~~ (2026-05-24, mig 0050) — vervangt de arbitraire 80/50-cutoff door een baseline afgeleid uit Mailchimp/Campaign-Monitor benchmarks (open 25% + click 1,8% + conv 1% → score 53), met dezelfde score-formule. winner ≥ 69, underperformer ≤ 37. Geldt voor alle kanalen; social/GBP blijven no_data tot hun OAuth-data + eigen baseline er is.
- [ ] **Per-restaurant-benchmark via shrinkage** (hfst 9.4) — i.p.v. vaste industry-baseline een blend naar eigen historie: `expected = (n × eigen_mediaan + k × industry_baseline) / (n + k)`, voorgesteld k=30. **Floris heeft hier een eigen plan voor — eerst met hem afstemmen vóór implementatie.** Vereist ook per-kanaal-mediaan (niet restaurant-breed mengen) zodra meerdere kanalen data hebben.
- [ ] **Per-kanaal score-formules + baselines** — mail-baseline (53) is afgeleid; social/GBP/WhatsApp hebben eigen genormaliseerde formules nodig (reach-rate = reach/followers, engagement-rate, etc.). Vereist follower-count → Meta/TikTok/GBP OAuth. Tot dan scoren alleen mail-campagnes.
- [x] ~~**Success/underperformer-injectie in prompts**~~ (2026-05-24) — `CampaignFingerprintService.buildLearningContextBlock()` laadt top-3 winners + top-3 underperformers per kanaal via JOIN met campaign_performance, plakt in chat.service + suggestions.service prompts.
- [ ] **Kennis-fasen-display** (hfst 9.6) — UI toont eigenaar in welke leer-fase z'n data zit (1: industry-only, 2: tentative, 3: eigen, 4: cross-restaurant). Logica zit in doc, UI nog niet.
- [x] ~~**Outlier-markering**~~ (2026-05-24) — knop in CampaignPerformanceCard met reden-input. POST/DELETE /campaigns/:id/performance/outlier. Excludeert uit getTopWinners/Underperformers-queries.
- [ ] **Channel-fatigue tracking** (hfst 14.7) — rolling 30-d frequency × engagement; alarm bij stijgende frequentie + dalende engagement.
- [x] ~~**campaign_sends.send_mode**~~ (2026-05-24, mig 0049) — test vs all_opted_in. Test-mails niet meegerekend in sent_count én geskipt in performance-aggregatie.
- [x] ~~**CampaignPerformanceCard UI**~~ (2026-05-24) — op /campagnes/[id] detail-page: score 0-100 + classification-badge + mail-breakdown (delivered/opens-rate/clicks-rate/bounces) + conversie (reservations/gasten) + outlier-markering inline.
- [x] ~~**CampaignSendCard UI**~~ (2026-05-24) — voor mail-campagnes: opt-in count + sample-namen + test-mail-input voorgevuld met restaurant.contact_email + verstuur-naar-alle-opt-in met confirm.
- [x] ~~**ensureRow bij status→actief**~~ (2026-05-24) — CampaignsService.updateStatus roept performance.ensureRow + fingerprint.extractFromCampaign aan.
- [x] ~~**Mail-status-label**~~ (2026-05-24) — getDisplayStatus helper: 'actief'+mail+sent_count=0 → "Klaar voor verzending"; sent_count>0 → "Verstuurd"; andere → bestaande STATUS_LABEL.

#### Website-laag (P0, geen OAuth nodig)
- [ ] **Meta Pixel JS-snippet** (hfst 14.2 + 19.1) — install in Next.js layout. Events: PageView, ViewContent, Lead, Reserve. Pixel-ID per restaurant.
- [ ] **TikTok Pixel JS-snippet** — zelfde events; aparte pixel-ID.
- [ ] **Cookie-banner CMP-mode-v2** — granulaire opt-in voor marketing-cookies vóór pixel fires; consent-mode-signalen naar Google + Meta.
- [ ] **GA4 of Plausible install** — page-tracking + custom events (campaign_click, reserve_intent, reserve_complete).
- [ ] **Schema.org markup site-breed** — Restaurant + Menu + FAQ + Event + Review (al deels in health-score-checks; nu daadwerkelijk implementeren).
- [ ] **E-mail SPF/DKIM/DMARC-records** — DNS configureren voor `send.getfilly.com`. Spam-folder-kans daalt 60%.
- [ ] **Resend IP-warming-protocol** — eerste 2-3 weken throttle in MailService op max 500 mails/dag per IP.
- [ ] **Preference-center pagina** — bestaande /unsubscribe uitbreiden: "alleen aanbiedingen" / "alleen events" / "alle mails" / "uitschrijven".
- [ ] **Reservation-page-UX-pass** — UTM-persist over multi-step, mobile-vriendelijke datepicker, success-page met conversie-pixel.

#### Vereist Meta Business OAuth (al op P1 backlog: Meta + TikTok approval)
- [ ] **Server-side Meta CAPI** (hfst 14.2) — server-side events naast pixel voor iOS 14.5+-accuracy.
- [ ] **Lookalike-audience-export** (hfst 12.4) — top-100 gasten naar Meta Ads API hashed-list.
- [x] ~~**IG/FB Insights-fetcher — fase 1 (live engagement)**~~ (2026-06-18) — `GET /integrations/meta/insights` → FB `published_posts` (likes/reacties/shares) + IG-account (volgers/media-count) + IG-posts (likes/reacties). Getoond via het `<MetaLiveInsights>`-blok bovenaan de IG-/FB-marketingpagina's (de mock-secties blijven als voorbeeld eronder). Werkt met de bestaande scopes (`pages_read_engagement` + `instagram_basic`); fail-soft per kanaal.
- [ ] **IG/FB Insights — fase 1b (volgersgroei over tijd)** — dagelijkse snapshot-tabel (`social_insights_snapshots`: restaurant_id, platform, captured_on, followers_count, media_count) + mini-cron of snapshot-on-fetch → volgersgroei-grafiek op de IG/FB-pagina. Geen nieuwe Meta-review nodig.
- [ ] **IG/FB Insights — fase 2 (volledige insights)** — scopes uitbreiden (`read_insights` + `instagram_manage_insights`) + **nieuwe Meta App Review** → bereik, impressions, profielweergaven, saves, story-stats. Daarna de bestaande IG/FB-mock-secties (reach-/engagement-charts, demografie) wiren naar echte data.
- [ ] **Publiceren naar Reels + Stories (IG + FB)** — nu publiceren we alleen feed-foto's (`meta.service`: FB `/{pageId}/photos`+`/feed`, IG `/{igUserId}/media` met `image_url` → `/media_publish`). Reels én Stories kunnen óók via de Graph API (geverifieerd juni 2026, v25). **App Review waarschijnlijk niet nodig** — IG Reels/Stories vallen onder de al-goedgekeurde `instagram_business_content_publish`, FB onder `pages_manage_posts` (beide al in gebruik); vóór bouwen wel even in het App Dashboard checken. **De drie échte klussen:** (1) video-hosting — Reels/video-stories vereisen een publieke `video_url` (Supabase Storage), FB Reels zelfs resumable/chunked upload; (2) async + polling — container maken, `status_code` pollen tot `FINISHED`, dán pas publiceren (huidige feed-flow is synchroon); (3) mediaspecs (Reels 9:16, 5–90s, H.264/HEVC) + Stories ephemeral (24u). **Endpoints per type:** IG Reels = container `media_type=REELS`+`video_url`; IG Stories = `media_type=STORIES` (foto/video); FB Reels = `/{pageId}/video_reels` (init→upload→publish); FB Stories = `/{pageId}/photo_stories` / `/{pageId}/video_stories`. **Voorgestelde fasering:** IG Stories eerst (kleinste stap, bijna identiek aan huidige IG-code) → IG Reels → FB-varianten. Let op IG-limiet 100 API-posts/24u (gedeeld over alle types). Docs: [content-publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [FB Reels](https://developers.facebook.com/docs/video-api/guides/reels-publishing/), [Page Stories](https://developers.facebook.com/docs/page-stories-api/).
- [ ] **UGC tag-detectie** (hfst 13.4) — Meta API poll naar tags van eigen account. ugc_pending-tabel.
- [ ] **FB Events i.p.v. posts** (hfst 16.4) — Filly maakt FB-event-objecten i.p.v. post-objecten voor events.
- [ ] **Auto-DM-templates voor UGC-toestemming** (hfst 13.4) — Filly stuurt pre-fab DM via Meta API.

#### TikTok OAuth + posten (Login Kit + Content Posting API) — CODE LIVE op main (2026-06-22)
Doel: TikTok-account koppelen + video posten via **Direct Post** (`video.publish`).
**LET OP — gewijzigd 2026-06-22:** Floris wil **Direct Post**, NIET de inbox/
concept-route. De video wordt dus direct op het account gepost (privacy-niveau
bepaalt zichtbaarheid), niet als concept naar de inbox gestuurd.
⚠️ Gevolgen: (1) het **demovideo-script** beschrijft nog de inbox-flow → moet
herschreven worden naar Direct Post. (2) Een **onaudited app kan alleen
`SELF_ONLY` (privé)** posten; publiek pas na app-review. (3) Direct Post is
strenger in review.
Demovideo-script: `~/Downloads/Demovideo TikTok script.docx`.

**Floris — TikTok Developer Portal (developers.tiktok.com):**
- [x] ~~App + Client Key/Secret~~ (keys staan in Vercel).
- [ ] Producten: *Login Kit* + *Content Posting API*. Scopes: `user.info.basic`
  + **`video.publish`** (Direct Post).
- [ ] Redirect URI: `https://www.get-filly.com/oauth/tiktok/callback` (exacte match).
- [ ] Domein-verificatie `get-filly.com` (nodig voor PULL_FROM_URL).
- [ ] Sandbox + testaccount; daarna demovideo (Direct Post-flow!) + app-review.

**Wij — code (mirror Meta):**
- [x] ~~Frontend `oauth/tiktok/{start,callback}/route.ts`~~ (✅ fase 1) — state-cookie + CSRF.
- [x] ~~Api `tiktok/`-module: token-exchange + refresh, opslag in
  `integration_credentials` (provider `tiktok`), `user.info.basic`~~ (✅ fase 1).
- [x] ~~`account-connections.tsx`: TikTok van "binnenkort" → "Verbind"~~ (✅ fase 1).
- [x] ~~**Compliant upload-scherm**~~ (✅) — `TikTokUploadPanel` op
  `dashboard/marketing/tiktok`, met de 3 audit-UX-elementen (creator-info,
  commercial-content-disclosure-toggle, music-usage-consent) + **titel-veld +
  privacy-selector** (Direct Post-vereisten; opties uit `creator_info`,
  onaudited default `SELF_ONLY`). De disclosure-toggles worden meegestuurd
  (`brand_organic_toggle`/`brand_content_toggle`).
- [x] ~~Posten via Content Posting API~~ (✅, **Direct Post** sinds 2026-06-22) —
  `getValidAccessToken` (refresh-on-use) + `creator_info/query` +
  **`post/publish/video/init`** (PULL_FROM_URL) met `post_info`. Endpoints
  `GET creator-info` / `POST upload`.
- [x] ~~**Media via get-filly.com-route (PULL_FROM_URL-glue)**~~ (✅) — Vercel-
  rewrite `/media/r/:path*` → publieke restaurant-media-bucket (transparant,
  geen redirect → domein blijft get-filly.com); MediaLibraryPicker in het
  upload-paneel, gekozen URL gemapt naar `/media/r/<pad>`. Live te valideren
  zodra TikTok-app + domein-verificatie actief zijn.
  ⚠️ Aandachtspunt: `restaurant-media` is een **foto**-bibliotheek; voor de
  video-upload moet er een **video** in staan (mime `video/*`). Eventueel de
  picker filteren op video + video-upload in de media-bibliotheek toestaan.

- [ ] **TikTok Insights-fetcher** — view/watch/share-stats per video (na approval).
- [ ] **TikTok Pixel-CAPI server-side** — zelfde verhaal als Meta CAPI.

#### Vereist Google Business Profile API (al op backlog: GBP fase C-F)
- [ ] **Auto-posting naar GBP** (hfst 16.7/16.8) — Q&A's + foto-cadans + posts pushen via GBP API.
- [ ] **GBP Insights-fetcher** — impressions, clicks per CTA-type, search-impressions.
- [ ] **Review-recency + antwoord-ratio** (hfst 9.10 + health-score V2) — vereist GBP-API voor review-lijst.
- [ ] **GBP-events aanmaken via API** — event-type posts voor evenementen.

#### Vereist WhatsApp Business API (apart van Meta OAuth, ook P1)
- [ ] **WhatsApp Business-template-flow** (hfst 16.6) — Meta-template-aanvraag + status-tracking in UI.
- [ ] **WhatsApp broadcast** via Twilio of Sinch — opt-in respectering verplicht.

#### Vereist CallRail of vergelijkbaar
- [ ] **Call-tracking** (hfst 14 + 19.4) — dynamic phone-numbers gekoppeld aan campaign_id.

#### Vereist POS-koppeling (toekomst)
- [ ] **Per-gast besteding-segment** (hfst 12.1) — gemiddelde check-bedrag per gast voor targeting.

### Email & campagnes
- [x] ~~**Campagne-send engine**~~ (2026-05-04) — `MailService.sendCampaignByMode` met test-modus + all_opted_in. Resend SDK + batches van 100. From=`<restaurant-naam> <social@get-filly.com>` of klant-eigen domein als verified. Reply-to via `restaurant.contact_email`. Pre-flight check op subject_line + body_html/body_plain. Webhook-handler updatet sends-rij bij delivered/bounced/opened/clicked. UI: `CampaignSendModal` met test/echt-toggle + confirm-on-name voor echt versturen.
- [x] ~~**Migratie 0030 (`campaign_sends` + `unsubscribe_tokens` + restaurants.mail_*)**~~ (2026-05-04)
- [x] ~~**Unsubscribe-route**~~ (2026-05-04) — Public `/u/[token]`-pagina + backend `POST/GET /public/unsubscribe/:token`. RFC 8058 List-Unsubscribe headers in elke mail (Gmail/Outlook tonen native unsubscribe-link). Idempotent.
- [x] ~~**Eigen-domein per klant**~~ (2026-05-04) — `MailDomainService` met Resend Domains API (create/verify/get/remove). UI: `<MailDomainSection>` op account-pagina met DNS-records-tabel + copy-knoppen + status-polling. Bij verified: mail komt van klant's eigen `mail_from_address` ipv default. Stay safe naast bestaande mail-providers (DKIM op subdomains).
- [ ] **DNS help-flow voor klanten** — stappenplan + per-registrar uitleg (TransIP / Versio / Hostnet / Namecheap / GoDaddy) + "wat doen die records"-helper voor klanten die DNS niet snappen
- [x] ~~**Resend webhook signature-validatie**~~ (✅ code af, 2026-06-18) — `MailController.receiveWebhook` (`@Post('webhooks/resend')`) verifieert de Svix-headers via `verifySvixSignature` tegen de rawBody (`rawBody: true` in `main.ts`); ongeldige calls → 401. Fail-soft zolang `RESEND_WEBHOOK_SECRET` niet gezet is (laat door + logt) zodat mail-stats niet breken. **Resteert (config, Floris):** (1) `RESEND_WEBHOOK_SECRET` (`whsec_…` uit Resend) in Vercel `get-filly-api` zetten + redeploy; (2) webhook in Resend-dashboard op `https://get-filly-api-three.vercel.app/api/webhooks/resend`.
- [ ] **Legal: DPA-template** — Verwerkersovereenkomst met klant. Resend + Anthropic + Supabase als sub-verwerkers vermelden in privacy-pagina.

### Integraties (OAuth)
- [~] **Facebook/Instagram OAuth** — Meta Graph API, `pages_manage_posts` + `instagram_content_publish` (vereist App Review, 2-8 weken). **Start + callback gebouwd** (2026-06-06): `/oauth/meta/start` (auth-gate + CSRF-state-cookie → Meta-dialog) en `/oauth/meta/callback` (state-check + code→token-exchange) in `apps/web`, gedeelde helper `lib/meta-oauth.ts`. Env: `META_APP_ID` + `META_APP_SECRET` (zie `.env.example`). Redirect_uri = `<origin>/oauth/meta/callback`, van request-origin afgeleid → registreer per Vercel-domein in Meta (nu www.get-filly.com; later app.get-filly.com-test-URL). Geen localhost (draait alles op Vercel). **Verbind-knop gewired** (2026-06-06): Facebook + Instagram in `account-connections.tsx` zijn nu method `oauth` → één klik op "Verbind" navigeert naar `/oauth/meta/start` (geen API-key plakken). Callback keert terug naar `/dashboard/account?tab=koppelingen` met `?meta=connected|denied|error`; `MetaStatusBanner` toont de uitkomst. **Stap 3 — token-opslag gebouwd** (2026-06-06): exchange + opslag verplaatst naar de **Nest-API** (`apps/api/src/meta`): web-callback valideert state en stuurt alleen de `code` naar `POST /api/integrations/meta/connect`; de API doet code→short→long-lived exchange, versleutelt (AES-256-GCM via `common/token-crypto.service.ts`) en upsert in tabel `integration_credentials` (**migratie 0052 — handmatig in SQL Editor draaien**, RLS op restaurant-lidmaatschap). Endpoints: `connect`, `GET status`, `DELETE` (disconnect). Env verplaatst: `META_APP_SECRET` + `INTEGRATIONS_ENCRYPTION_KEY` → **API-env** (web houdt alleen `META_APP_ID`). **Meta-callbacks gebouwd** (2026-06-06): `/oauth/meta/deauthorize` + `/oauth/meta/data-deletion` (web-routes → forwarden naar publieke API-endpoints `MetaWebhookController`, géén guards). API verifieert de `signed_request` (HMAC-SHA256 met App Secret, `meta-signed-request.ts`) en verwijdert via service-role op `meta->>meta_user_id`. Data-deletion geeft `{ url, confirmation_code }` terug; statuspagina `/data-deletion-status?id=` (stateless, noindex). `connect` slaat nu het `meta_user_id` op in `integration_credentials.meta` zodat de callbacks de rij vinden (alleen voor koppelingen ná deze deploy). **Stap 4 — publiceren gebouwd** (2026-06-06): API-endpoints `GET /pages` (lijst via `/me/accounts`), `POST /select-page` (slaat `page_id`/`page_name`/`ig_user_id` op in `meta`), `POST /publish` (FB-feed/-foto via verse page-token + IG 2-staps media→media_publish, vereist afbeelding-URL). Page-token wordt NIET opgeslagen (telkens vers uit `/me/accounts`). UI: `meta-publish-panel.tsx` in de koppelingen-tab — pagina kiezen + testbericht naar FB/IG. Hiermee gebruikt de app de scopes echt (nodig voor App Review-demo). **Getest 2026-06-06**: deauthorize + data-deletion end-to-end geverifieerd (geldige `signed_request` → 200, oude/verkeerde → afgewezen); **App Secret geroteerd** (oud `685ce1c…` bevestigd dood na redeploy); data-deletion-URL nu op canoniek `www.get-filly.com`.
  - ✅ **Code-kant is af en bevestigd werkend** (verbinden, opslaan, callbacks, publiceren).
  - ✅ **App Review GOEDGEKEURD (2026-06-17)** — Meta-kant rond: redirect + deauthorize + data-deletion-URL's gesaved, business-verificatie + Tech Provider gedaan, demovideo + de 6 scope-test-calls (via de Graph API Explorer: `me/businesses`, `me/accounts`, `{page}/published_posts`, `{ig-id}?fields=...`) ingediend en goedgekeurd. Overbodige use-case-permissies verwijderd. App staat live → restaurants kunnen verbinden + publiceren.
  - 🔧 **Code-restjes (vóór live klanten, niet blokkerend)**: long-lived token auto-refresh vóór 60-dagen-verloop; scopes uitlezen via `debug_token`. *(In-app loskoppel-knop = ✅ gedaan. Publiceren-vanuit-campagnes = ✅ gedaan, zie hieronder.)*
  - ✅ **Publiceren vanuit de campagne-sectie (fase A + B, 2026-06-17)** — social-campagnes publiceren naar FB/IG via de goedgekeurde Meta-flow:
    - **Fase A (live op `main`)**: "Activeer nu" plaatst direct (caption + foto + `social_platforms` → FB/IG), idempotent via `published_at`. Migratie **0058** (`published_at`/`published_post_ids`/`publish_error`, gedraaid). Degradeert netjes zonder Meta-koppeling (alleen status-flip, geen harde fout).
    - **B1 terugtrekken** (actief→concept): FB-post wordt écht verwijderd (`DELETE`); **Instagram kan NIET via de Graph API verwijderd worden** → handmatig (stop-confirm vermeldt dit).
    - **B2 cron**: `runScheduledSocial()` + publiek `/api/campaigns/cron/run-scheduled` (CRON_SECRET) publiceert due `ingepland`-campagnes; `useAdmin`-flag voor de context-loze run.
    - ⚠️ **TODO bij overstap Vercel Hobby → Pro**: cron in `apps/api/vercel.json` staat nu dagelijks 08:00 (Hobby-limiet, niet punctueel); bumpen naar `*/10 * * * *` voor on-time posten.
    - ~~Google Bedrijfsprofiel-posts via dezelfde campagne-flow~~ (✅ 2026-07-07 — `google_business`-tak in `publishSocialCampaign`, post + foto). Nog open: WhatsApp publiceren (geen API-koppeling); TikTok is er al.
  - 👉 **VOLGENDE STAP (volgende sessie)**: redirect-URI in Meta opslaan → Verbind-flow doorlopen → bevestigen dat pagina-ophalen + testpost werkt.
- [ ] **Publiceren vanuit de campagne-sectie** (echte product-UX i.p.v. het losse test-paneel) — de publiceer-backend is al af (`POST /api/integrations/meta/publish` + versleutelde token-opslag); wat ontbreekt is de knop in de campagne die 'm aanroept. Twee niveaus:
  - **"Nu publiceren"** — knop op een social-campagne (`campagnes/[id]`) die de campagnetekst + geüploade foto naar `metaPublish` stuurt (FB en/of IG). Klein; hergebruikt alles wat er is. Daarna kan het losse `meta-publish-panel.tsx` op de koppelingen-tab test-only worden of verdwijnen.
  - **Ingepland automatisch posten** — op de geplande datum/tijd afvuren. Vereist een achtergrond-worker/cron (Vercel Cron) die due social-campagnes oppakt en publiceert. Groter; aparte stap (mail wil dit straks ook).
  - ~~Idem voor Google Bedrijfsprofiel-posts~~ (✅ 2026-07-07 — GBP-post via de campagne-knop werkt, zie changelog).
- [x] **Google Business Profile** — kern live (verbinden + profiel lezen/schrijven + reviews + posts + foto's). ✅ 2026-07-07; alleen OAuth-app-verificatie + demovideo resteren. Zie sectie hieronder.
- [ ] **Zenchef OAuth** — reserveringen syncen
- [ ] **OpenTable / SevenRooms / Resengo** — volgorde bepalen met klantvraag
- [ ] **TripAdvisor / The Fork / IENS** — reviews importeren
- [ ] **Webhook-receivers** per integratie met rijtests

#### Google Business Profile — fase-overzicht (besluit 2026-05-05)

Reviews-sectie is uitgebreid tot een hub. Reviews zijn een sub-feature
van Google Business Profile (GBP) — naast profiel-audit, posts, foto-sync,
profiel-edits en inzichten. Fase A is af; fase B-F staan open.

- [x] ~~**Fase A — Skelet + rename**~~ (2026-05-05). Sidebar `Reviews` →
  `Google Business`, route `/dashboard/reviews` → `/dashboard/google-business`
  (oude route blijft als 308-redirect-stub). Module-key in
  `@getfilly/shared` van `reviews` naar `google_business`. Migratie 0033
  heeft bestaande `restaurant_users.permissions`-jsonb ook bijgewerkt.
  Nieuwe hub-pagina toont 7 cards: Reviews (live, klikbaar), Profiel-audit,
  Concurrent-benchmark, Filly-posts (copy-paste), Profiel-edits, Foto-sync,
  Inzichten — laatste 6 met "Coming Soon"-badge. Status-banner bovenaan
  toont "niet gekoppeld met Google" (hardcoded tot fase D).

- [x] ~~**Fase B — Places-API laag (geen klant-actie nodig)**~~
  (2026-05-05). Google Cloud project `Get-Filly GBP` onder organisatie
  `get-filly.com`, Places API (New) actief, key in `GOOGLE_PLACES_API_KEY`
  met API-restrictie naar alleen Places (New). Migratie 0034 heeft
  `restaurants.google_place_id` + `google_place_data` jsonb-cache (24u
  TTL) toegevoegd. `GoogleProfileModule` (apps/api/src/google-profile/)
  met 6 endpoints: search/connect/me/refresh/disconnect/audit/competitors.
  Onboarding-wizard auto-detect via place-search na WebsiteAnalyzer met
  "Wijzigen / Sla over"-flow in stap 2. Hub-pagina dynamisch met status-
  banner (gekoppeld vs niet) + connect-modal + ontkoppel-knop voor
  bestaande klanten. Twee feature-pagina's live:
  - **/dashboard/google-business/audit** — 12+ deterministische rules
    (telefoon, website, openingstijden, foto-volume, review-volume,
    rating-coaching, weekend-uren, business-status, categorie). Gratis,
    geen Claude-call. Sortering critical → warning → tip met
    actie-hints per finding.
  - **/dashboard/google-business/benchmark** — buurt-vergelijking met
    radius-selector (250m-3km). 3 KPI-tegels (rating/reviews/foto's
    vs mediaan). Tabel met jouw zaak gehighlight + concurrenten
    gesorteerd op afstand. Mediaan i.p.v. gemiddelde voor robuustheid.
  - ~~Filly-posts (copy-paste)~~ — 2026-05-05 verwijderd na review:
    overlapt met de bestaande Filly-chat (eigenaar kan in chat al
    "schrijf me een Google-post" vragen). Posts verdwijnen na 7 dagen
    in Google + beperkte SEO-impact. **Per 2026-06-02 geïntegreerd** als
    volwaardig kanaal in de chat-bundel-flow naast Mail/IG/FB + WhatsApp
    (zie Recent voltooid 2026-06-02).

- [x] ~~**Fase C — Google Business Profile API approval-aanvraag**~~ (✅ 2026-07-07)
  — API-toegang goedgekeurd + quotum live (~300 req/min). Account Management,
  Business Information én Google My Business API v4 staan aan in project
  167329672884 (developer@get-filly). Zie changelog 2026-07-07.

- [x] **Fase D — OAuth-koppeling (business.manage, offline)** — ✅ **LIVE op `main`**
  (verbinden werkt, `invalid_client` opgelost, beheer-writes geshipt — zie changelog
  2026-07-07). Historie hieronder ter referentie.
  (2026-06-14, branch `feat/active-action-state`, commits `e050733` + `fcaa97e`;
  gemerged naar `main` + live). Afwijkend van het
  oorspronkelijke plan (géén nieuwe `oauth_connections`-tabel / generieke
  `OAuthModule`): **hergebruikt het Meta-patroon** — tabel `integration_credentials`
  (mig 0052) + `TokenCryptoService`. **Migratie 0057** voegt `refresh_token_encrypted`
  toe (al in Supabase gedraaid).
  - **web** (`apps/web`): `/oauth/google/start` (auth-gate + getekende state:
    HMAC-SHA256 over `{rid,nonce,iat}` + nonce-cookie, draagt tenant-id, verloopt
    10 min) en `/oauth/google/callback` (state-verify → alleen de `code` naar de
    API). Helper `lib/google-oauth.ts`. `access_type=offline` + `prompt=consent`
    → altijd een refresh-token.
  - **api** (`apps/api/src/google-business`): `GoogleBusinessModule`
    (`/integrations/google-business/*`): `connect` (code→access+refresh,
    versleuteld opslaan, provider `google_business`), `GET status`, `DELETE`
    (revoke bij Google + rij wissen), plus `getAccessToken`/`refreshAccessToken`
    (auto-refresh op (bijna-)expiry).
  - **UI**: één status-gestuurde Google-rij in `account-connections.tsx` achter
    feature-flag `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` (default uit → "Beheer"; aan +
    niet verbonden → "Verbind"). `googleBusinessStatus()` in `lib/api.ts`,
    status-banner voor `?google=connected|denied|error&reason=`.
  - Foutafhandeling: weigeren, `redirect_uri_mismatch`, verlopen/ongeldige state,
    ontbrekende refresh-token (alle gemapt naar nette `reason`-codes).
  - ✅ **AFGEROND (2026-07-07) — Google Cloud-kant** (client-id/redirect-URI's/consent/env allemaal goed; APIs aan). Historische to-do's hieronder ter referentie:
    1. ⚠️ **OAuth-client in het JUISTE account/project.** Client-id in `.env` is
       `167329672884-...` (project-nummer `167329672884`). Uitzoeken of dat het
       **officiële Filly-account** is of per ongeluk Floris' persoonlijke gmail —
       voor productie/verificatie hoort 'ie in het officiële account. **Tim** beheert
       het Bedrijfsprofiel en is mogelijk eigenaar van het Cloud-project.
    2. **Redirect-URI's** exact registreren op díé client: prod
       `https://www.get-filly.com/oauth/google/callback` + lokaal
       `http://localhost:3000/oauth/google/callback`. (2026-06-14: lokale test gaf
       `redirect_uri_mismatch` — waarschijnlijk verkeerd account/project of propagatie.)
    3. **Consent screen**: test-user (Audience), scope `business.manage` (Data
       Access, sensitive → app-verificatie), **publiceren naar Productie** (anders
       verlopen refresh-tokens na 7 dagen in "Testing").
    4. **Env in Vercel**: `GOOGLE_OAUTH_CLIENT_ID`+`GOOGLE_OAUTH_CLIENT_SECRET` (api),
       `GOOGLE_OAUTH_CLIENT_ID`+`OAUTH_STATE_SECRET`+`NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`
       (web), `INTEGRATIONS_ENCRYPTION_KEY` (api). Lokaal al gezet (zie `.env.example`).
    5. **Fase C** (API-toegang aanvragen, quotum 0) blijft de lange-doorlooptijd-
       blocker vóór écht profielbeheer.
  - 👉 **VOLGENDE STAP**: alleen nog de OAuth-app-verificatie (sensitive scope) +
    demovideo opnemen (nu is er écht beheer om te tonen). Zie changelog 2026-07-07.
  - **Verificatie-prep klaar** (2026-06-15): `GET /integrations/google-business/profile`
    (accounts.list via getAccessToken — bewijst scope-gebruik, 403→`api_not_approved`
    tot de API-grant) + `GoogleConnectedPanel` (zichtbaar bewijs in de koppelingen-tab).
    Justificatie-tekst (EN) + demovideo-script + test-checklist + Meta-parallel staan
    in [docs/setup/oauth-verificatie.md](docs/setup/oauth-verificatie.md).

- [x] ~~**Fase E — Reviews écht uit Google ophalen**~~ (✅ 2026-07-07) — live
  Google-reviews (v4 `reviews.list`) verschijnen in de Reviews-sectie; antwoorden
  gaat rechtstreeks naar Google (`reviews.reply`) met Filly-suggestie. Gekozen voor
  **live ophalen** i.p.v. een sync-tabel (geen migratie); seed-reviews met bron
  google worden verborgen zodra de live-koppeling reviews levert. Zie changelog
  2026-07-07. *(Optioneel later: alsnog naar een `reviews`-sync-tabel + cron als we
  offline-verwerking/attributie willen.)*

- [~] **Fase F — Profiel-edits + foto-sync (+ Q&A/Inzichten geschrapt)**.
  - [x] ~~Profiel-edits~~ (✅ 2026-07-07) — omschrijving, openingstijden en speciale
    dagen bewerkbaar + push naar Google (`locations.patch`). Basisgegevens worden
    gelezen via de API.
  - [x] ~~Foto-sync~~ (✅ 2026-07-07) — upload uit de Filly-bibliotheek naar het
    profiel (`media.create`, omslag/logo/extra) + foto op Google Posts.
  - ❌ **Q&A geschrapt** — Google's Q&A-API is in nov 2025 stopgezet (kaart verwijderd).
  - ❌ **Inzichten geschrapt** — vereist de Performance API; geen must-have (kaart weg).
  - [ ] **Rest open:** naam/telefoon/website/categorie *bewerkbaar* maken (nu alleen
    gelezen); adres + categorie zijn gestructureerder werk.

### Mock-data in frontend (opruimen zodra backend er is)
- [x] ~~**`FILLY_MOCK`** in kpi-row.tsx~~ (2026-04-29) — verwijderd, alleen echte attributie via `reservations.via_campaign_id`-FK.
- [x] ~~**`isFromFilly()`**~~ (2026-04-29) — kolom + stat-card weg uit gasten-pagina; reserveringen-pagina nu op echte `source`-veld.
- [x] ~~**`FILLY_ROI_6M` + `FILLY_BY_TYPE`** in rapportages~~ (2026-04-29) — vervangen door echte 6-mnd grafiek + per-campagne tabel.
- [x] ~~`buildFillyReply()` in reviews~~ — vervangen door echte Claude-call (2026-04-23)
- [x] ~~`MOCK_RECOGNIZED` in menu-pagina~~ — vervangen door echte Vision-analyse tijdens onboarding.
- [x] ~~`getMockProposal()` in suggesties-detail-modal~~ (2026-04-30) — vervangen door echte Claude-call via tool-use op `/api/suggestions/:id/proposal-details`.
- [ ] **`cardItemIds`-set in memory** in menu-pagina — UI-state voor net-toegevoegde items, hoort uit DB-flow te komen.
- [x] ~~**Statische koppelingen-lijst** zonder OAuth-flow~~ (2026-06-11) — de mock is opgeruimd: de nep-API-key-flow (eindigde in een `alert("Storage komt binnenkort")`) is weg uit `account-connections.tsx`. Nu eerlijke statussen: Meta = echte OAuth-verbindknop, Google Business = "Beheer"-link naar de Vindbaarheid-hub (waar de echte koppel-flow leeft), mail + weer = "✓ Actief", al het overige (Zenchef/OpenTable/SevenRooms/Resengo/TikTok/WhatsApp/TripAdvisor/The Fork/Lightspeed) = rustige "Binnenkort"-pill. SendGrid-rij verwijderd (mail loopt via het platform; loze belofte). De échte integraties blijven gewoon op de "Integraties (OAuth)"-backlog hieronder staan.
- [x] ~~**Koppelingen-sectie status-aware + opgeschoond**~~ (2026-06-15) — `account-connections.tsx` herbouwd: koppelingsstatus 1× op sectie-niveau opgehaald (Meta + Google) en doorgegeven aan de rijen. OAuth-rijen tonen nu de échte staat — niet verbonden → "Verbind", verbonden → "✓ Verbonden" + Beheer (Google-hub) + Ontkoppel — i.p.v. altijd "Verbind". Facebook + Instagram delen de Meta-status (één koppeling). Disconnect-helpers `metaDisconnect` + `googleBusinessDisconnect` in `lib/api.ts`. Verouderde duplicaat-pagina `/dashboard/koppelingen` (nog "SendGrid" + hardcoded statussen) vervangen door een redirect naar `/dashboard/account?tab=koppelingen`. Dode `connected`-field verwijderd; `reason`-param per banner gescheiden (Meta vs Google).

### Database-migraties nog te maken
- [x] ~~0049: campaign_sends.send_mode (test vs all_opted_in)~~ (2026-05-24) — test-mails tellen niet in sent_count en worden geskipt in campaign_performance-aggregatie. Index op (campaign_id, send_mode) voor snelle count-by-mode-query.
- [x] ~~0048: campaign_style_fingerprints (anti-repetitie + leerloop)~~ (2026-05-24) — opening_pattern / hashtag_set / cta_template (enum) / theme / primary_dish_mentioned / tone_signature (enum) per kanaal. UNIQUE op campaign_id voor idempotente upserts. RLS via user_has_restaurant_access.
- [x] ~~0047: classify_campaign_performance() PL/pgSQL + pg_cron 03:17 UTC~~ (2026-05-24) — nightly scoring van campagnes >14d oud via open_rate*30+click_rate*50+conv_rate*20. Set classification = winner/average/underperformer/no_data + success_score + measurement_complete_at. Idempotent: skipt rijen met classification al gezet of marked_outlier=true.
- [x] ~~0046: campaign_performance-tabel~~ (2026-05-24) — alle kanalen-kolommen (mail/social/whatsapp/gbp) nullable + reservations_attributed + guests_attributed + revenue_attributed_cents + success_score + classification + outlier-flag + measurement_complete_at. RLS via user_has_restaurant_access; trigger op updated_at.
- [x] ~~0045: health_scores + health_findings + health_competitors (vindbaarheid-health-score v1)~~ (2026-05-23) — drie tabellen voor de Health-score op `/dashboard/google-business/audit`. Snapshots per audit-run + alle findings + top-10 concurrenten in 500m straal. RLS via `user_has_restaurant_access`. SQL was al in-Studio gerund door Floris vóór file-commit; file is voor productie-environments.
- [x] ~~0044: identiteit-uitbreiding (8 nieuwe kolommen op restaurants)~~ (2026-05-21) — `location_description`, `keywords`, `default_hashtags`, `tone_of_voice`, `do_not_mention`, `brand_story`, `awards`, `target_audience_segments`. Voedt Filly's posts vanuit `/dashboard/vindbaarheid/identiteit`. Geen RLS-wijziging.
- [x] ~~0043: pg_cron auto-archive verstreken campagnes~~ (2026-05-21) — dagelijks om 03:17 UTC zet status='afgerond' op campagnes met scheduled_for in het verleden. Frontend filtert óók read-time als safety-net.
- [x] ~~0042: backfill `campaigns.ai_suggestion_id`~~ (2026-05-21) — historische campagnes hadden alleen `ai_suggestions.approved_campaign_id` ingevuld, niet de FK terug. Twee UPDATE-passes (anker + bundle-siblings via group_id) vullen het netjes in.
- [x] ~~0041: `campaigns.variants` + `selected_variant_index`~~ (2026-05-21) — bron-van-waarheid voor versies-grid op unified detail-page. Backfill voor mail/social/whatsapp: huidige content = Versie 1, oude `filly_variants` worden Versie 2..N. Was niet eerder gedraaid → fix voor "selected_variant_index column not found"-error in Filly-chat goedkeuren-flow.
- [x] ~~0040: `campaigns.deleted_at` (soft-delete)~~ (2026-05-12, commit `1df6037`) — `× Verwijderen` op concept-cards doet nu UPDATE deleted_at=NOW(); verwijderde campagnes komen terug in `/campagnes/history` onder de tab Verwijderd. Partial index op deleted_at IS NOT NULL.
- [x] ~~0026: `campaigns.variant_applied_at` + `scheduling_history`~~ (2026-04-30) — verbergt refine-sectie na variant-keuze; cyclen door schedule-history zonder Claude-calls.
- [x] ~~0025: `menu_uploads.kind` ('menu' \| 'drinks')~~ (2026-04-30) — onderscheid menu-kaart vs drankkaart in UI-banners.
- [x] ~~0024: `menu_items.subcategory`~~ (2026-04-30) — drank-detail (wijn-rood, bier, cocktail, etc.) voor visuele groepering binnen drank-tab.
- [x] ~~0023: `campaign_benchmarks` + `account_deletions` (anonymisering + AVG art. 17)~~ (2026-04-30)
- [x] ~~`reservations.via_campaign_id` + `guests.acquired_via_campaign_id`~~ (migratie 0022, 2026-04-29)
- [x] ~~`menu_uploads` + Storage-bucket + FK menu_items.menu_upload_id~~ (migratie 0011, 2026-04-24)
- [x] ~~ai_usage.restaurant_id nullable (pre-onboarding logging)~~ (migratie 0012, 2026-04-24)
- [x] ~~restaurants.website_url + onboarded_at~~ (migratie 0010, 2026-04-24)
- [ ] **`campaigns.metrics` uitbreiding** — extra_reservations/revenue/retention als typed columns ipv result_stats jsonb (handiger voor analytics).
- [ ] **`subscriptions`** (billing)
- [x] ~~**`campaign_sends`** (email-history)~~ (afgevinkt 2026-06-11) — bestond al: aangemaakt in migratie `0030_mail_flow.sql`, uitgebreid in 0049 (`send_mode`). Dit regeltje was een verouderde dubbeling.
- [ ] **`guest_segments`** (doelgroep-segmentatie)

---


## P3 — UX-verfijningen

### Chat
- [x] ~~**Eén flow: getypt verzoek → geleide flow**~~ (2026-06-12) — campagne-verzoeken via typen lopen nu door dezelfde geleide flow als de lege-chat-staat. Chat-prompt emit `<<FILLY_START_GUIDED>>{date?}` (relatieve datums → ISO); guided_start-kaart rendert FillyGuidedFlow inline met `initialDate` (slaat dag-stap over). Oude FORMAAT 0/1/2-campagne-creatie + de "Vraag Filly om voorstellen"-knop verwijderd; legacy-parsers blijven als vangnet. ⚠️ **Live verifiëren:** relatieve datums (zondag/morgen/volgende week zondag/Vaderdag) + dat de inline-flow soepel naar context/kanalen springt.
- [x] ~~**Geleide on-ramp in lege chat (fase 1)**~~ (2026-06-12, commit `5da4658`) — i.p.v. een leeg vlak begint Filly met een vraag + aanklikbare dag-antwoorden (rustige dagen onder drempel + speciale dagen). Eén tik → `generate-for-dates` → /campagnes. Nieuw `lib/use-actionable-days.ts` + `filly-guided-flow.tsx`. Vrije tekst blijft als uitweg.
- [x] ~~**Geleide flow fase 2 — context + kanalen**~~ (2026-06-12, commit `7768167`) — `GET /suggestions/day-context?date=` (events op die dag + weer + kanalen-met-bereik, read-only) voedt stap 2 (event/weer bevestigen, voorgeselecteerd) + stap 3 (kanalen voorgevinkt). `generate-for-dates` accepteert nu `channels[]` + `context[]` per item en stuurt de generatie (campaign_type op primair kanaal, context-hints in dag-context). 3-staps wizard met antwoordspoor + "wijzig". **Restje fase 2b:** true multi-channel/bundle-output per dag — nu produceert een meerkanaals-keuze één voorstel op het primaire kanaal (afgestemd op de rest), geen losse kaart per kanaal.
- [x] ~~**Chat-interactie-polish (fase 3a)**~~ (2026-06-12, commit volgt) — meerregelige textarea-invoer (Enter=versturen, Shift+Enter=regel, auto-grow), slimme auto-scroll + "↓ nieuwe berichten"-pil i.p.v. altijd-yanken, skeleton-laadbubbels, typing-indicator met avatar + aria-live, `.sr-only` utility. Frontend-only.
- [x] ~~**Inline resultaat in de geleide flow**~~ (2026-06-12, commit volgt) — na genereren verschijnt het voorstel als kaart ín het gesprek (naam + kanaal + snippet + "Bekijken & aanpassen →" + "Nog een dag"/"Alle voorstellen") i.p.v. abrupt naar /campagnes te navigeren. Lichte versie: linkt naar de detail-route, géén volledige interactieve approve-kaart in de chat (dat blijft fase 3b).
- [x] ~~**Eén ingang: popover gaat op in de chat**~~ (2026-06-12, commit volgt) — de "Vraag Filly om voorstellen"-knop (dashboard-tile + campagnes) opent niet meer z'n eigen dag-selectie-popover maar de geleide chat-flow (window-event op /dashboard, sessionStorage-vlag + navigatie elders; chat-kaart id=filly-chat). SuggestionsPanel verwijderd (dode code; batch-meerdere-dagen wordt nu sequentieel via "＋ Nog een dag").
- [ ] **Geleide flow — laatste afronding** — resultaat als volledige interactieve approve-kaart in de chat (shape-adapter AiSuggestion → proposal/bundle-card) i.p.v. de huidige link-kaart. **Dedupe-kans:** `use-actionable-days` + UpcomingActionsBlock delen dezelfde rekenlogica los — samenvoegen.
- [x] ~~**Geleide flow fase 2b — true multi-channel**~~ (2026-06-12, commit volgt, **nog niet gepusht — live verifiëren**) — bij 2+ gekozen kanalen genereert `generateForSelectedDates` nu één voorstel per kanaal (eigen tekst + lengte-guard) in dezelfde channels[]-shape als generateOnDemand, zodat voorstellen-strip + bundel-approve 'm ongewijzigd aankunnen. Fail-soft per kanaal. ⚠️ **Te checken vóór/na push:** dat de bundel-approve op deze via-generate-for-dates gemaakte suggesties werkt (shape is identiek aan generateOnDemand, dus zou moeten — maar niet end-to-end getest vanaf dev).
- [x] ~~**Nieuw-gesprek-knop** in filly-chat + seed-cleanup~~ (2026-05-01) — `+ Nieuw gesprek` in dropdown + automatische CTA bij cap-bereikt. Seed-cleanup via migratie 0028 (`delete from chat_conversations where created_at < '2026-01-01'`).
- [x] ~~**Chat-geschiedenis overzicht**~~ (2026-05-01) — `FillyChatHistoryMenu` dropdown in chat-card-header. Toont titels (uit auto-title), `message_count/20`, switch-flow met optimistic state-replace. Endpoint `GET /chat/conversations`. Optimaal voor de nieuwe 20-berichten-cap (kostenbescherming).
- [ ] **Streaming** — woord-voor-woord antwoorden (SSE)

### Dashboard algemeen
- [ ] **Command palette** (Cmd+K)
- [ ] **Notifications-bell** werkend
- [ ] **Keyboard shortcuts** overzicht
- [x] ~~**Export CSV/PDF** per pagina (gasten, reserveringen, rapportages)~~ (2026-06-11) — gedeelde helper `lib/csv-export.ts` (BOM + quote-escaping). Per pagina: **gasten** = klanten-CSV (volgt filter+zoekterm; verhuisd van de reserveringen-pagina waar 'ie gek genoeg woonde), **reserveringen** = reserveringen-CSV (datum/tijd/naam/personen/status/bron/via-campagne/notities, volgt filters), **rapportages** = kanaal-overzicht-CSV. **PDF** op alle drie via 🖨-knop → browser-printdialoog ("Bewaar als PDF"); `@media print`-regels in dashboard.css verbergen sidebar/topbar/knoppen en heffen de fixed-viewport-scroll op. Bewust geen PDF-library (bundle-gewicht).
- [x] ~~**Mobile responsive pass**~~ (2026-04-30) — alle 5 fasen afgerond. Sidebar wordt offcanvas onder 1024px (☰-burger in topbar), dash-body 1-kolom op tablet, KPI-row 5→2→1 cols, weather-row auto-fit (geen doormidden gesneden dagen meer), tabellen horizontaal scrollbaar binnen container, modals full-screen onder 768px, save-bar sticky bottom op mobile, publieke site (navbar/login/legal) ook mee. Breakpoints: 1024 / 768 / 480. **Aanvulling 2026-06-02**: vervolg-sweep fixte resterende gaten die deze pass miste — échte hamburger-navbar < 880px, dashboard scrollt op mobiel (kalender werd 0px hoog), kalenderkop-toggle wrapt, half-scherm 2-koloms, social-waaier/hero-mockup/tijdlijn/legal+rauwe tabellen. Zie changelog 2026-06-02.
- [ ] **i18n (EN)** — engels voor internationale klanten later

### Onboarding nieuwe klant
- [x] ~~3-stappen wizard met Filly-auto-invul~~ (2026-04-24)
- [x] ~~**Sample-data via SQL voor demo-account**~~ (2026-04-30) — geen UI-toggle (bewust om Filly's promise schoon te houden); aparte SQL-snippet in chat die het demo-account `floriskoevermans@outlook.com` (restaurant_id `a462cf39-...`) vult met 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews, 5 campagnes (mix statussen), 3 pending suggesties. Voor échte klanten: "✨ Vraag Filly om voorstellen"-knop op /campagnes geeft direct waarde zonder fake data.
- [x] ~~**Setup-checklist** op account-pagina~~ (2026-04-30) — `OnboardingChecklist`-component met 6 items + progress-bar + ✕-dismiss (localStorage). Bewust op account-pagina, niet dashboard (waar het andere KPI's zou wegduwen).

---


## Test-data & seeds

- [x] ~~`apps/api/supabase/seeds/test_restaurants.sql`~~ — exacte inhoud uit Supabase gekopieerd (commit `699c84b`).
- [x] ~~Demo-account voor klant-demos~~ (2026-04-30) — `floriskoevermans@outlook.com` / restaurant_id `a462cf39-ef9b-49cb-bd8e-a84a10a3f888` gevuld via SQL-snippet (in chat-historie); 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews, 5 campagnes, 3 pending suggesties. Snippet niet in repo — bewust ad-hoc voor jouw demo, geen UI-toggle voor klanten.
- [x] ~~**Mock-chat-berichten uit 0001-seed opruimen**~~ (2026-05-01) — onderdeel van migratie 0028: `delete from chat_conversations where created_at < '2026-01-01'`. Cascade verwijdert ook gekoppelde chat_messages.
- [x] ~~`test_campaigns.sql`~~ — niet nodig (bleek duplicaat van migratie 0005).

---


## Bekende kleine bugs / TODO-markers in code

Grep periodiek op `TODO`, `FIXME`, `MOCK`, `mock` in `apps/` om bij te
werken. Laatste audit: 2026-04-30.

- [x] ~~`/apps/web/src/app/dashboard/_components/filly-chat.tsx` — 635 regels~~ (2026-04-30) — gesplitst in 5 files: orchestrator (`filly-chat.tsx` 331r), `filly-chat-message-list`, `filly-chat-input`, `filly-chat-proposal-card`, `filly-chat-error-banner`, `filly-chat-types`. Geen file meer >350 regels. Logica letterlijk verplaatst, geen gedrag-wijziging.
- [x] ~~`/apps/web/src/app/dashboard/account/page.tsx` — bevat nog "Komt beschikbaar zodra de Claude API gekoppeld is"-melding~~ (afgevinkt 2026-06-11) — de string bestaat nergens meer in de codebase.
- [ ] Next.js warning `"middleware" file convention is deprecated; use "proxy" instead` — cosmetisch, te fixen door file te hernoemen naar `proxy.ts` bij een volgende pass.
- [x] ~~[kpi.service.ts](apps/api/src/kpi/kpi.service.ts) — `weekday_avg_pct = 68` hard-coded~~ (2026-04-30, zie Data Analyst-audit voor cascade-details).

---


## 📌 Open punten uit eerdere sessies en audits

Deze punten stonden verspreid door de sessieverslagen en auditrondes. Het
verslag zelf staat in [`docs/CHANGELOG.md`](docs/CHANGELOG.md); hieronder staat
alleen wat er nog open van is, met de sessie als kop zodat de context vindbaar
blijft.

---

### 🗓️ 2026-09-16 — Rem per IP op de endpoints die geld kosten (mig 0076)

- [ ] **Dit is geen bescherming tegen een gedistribueerde aanval.** Een botnet
      met duizend IP's loopt er gewoon omheen. Daarvoor is een WAF nodig
      (Vercel Firewall staat al als los punt in de backlog). Dit vangt het
      meest voorkomende geval af: één bron die doorramt.

- [ ] Optioneel `RATE_LIMIT_SALT` in de API-env zetten. Zonder die var valt
      'ie terug op `CRON_SECRET`, wat prima werkt; zonder allebei logt de guard
      een waarschuwing en zijn de hashes terug te rekenen.


### 🗓️ 2026-09-16 — Bezettingsrapportage op echte data + maandoverzicht

- [ ] **Over twaalf maanden**: de vergelijking met vorig jaar daadwerkelijk
      bouwen op `busyness_monthly`. Tot die tijd staat er niets over vorig jaar
      op de pagina, en dat is correct.

- [ ] **Controleren dat er echt iets in `busyness_monthly` landt** zodra 0075
      gedraaid is. Ik kan dat niet zien zonder productie-toegang; één keer
      `/api/busyness/cron/rollup` aanroepen en de tabel bekijken volstaat.


### 🗓️ 2026-09-15 — Rustige momenten: variatie per datum (branch `feat/rustige-momenten-variatie`)

- [ ] Visuele check op het ingelogde dashboard (sterretjes, reden-regel, de
      "alles al afgedekt"-tekst). Niet gedaan: vraagt een echte login.

- [ ] **Dit doet voorlopig bijna niets, en dat hoort.** Onder 3 metingen per
      slot weegt er niets mee, en daarboven krimpt de uitslag met n/(n+4).
      Bij 4 metingen per slot is het verschil tussen een bewezen en een
      do-niets-slot ~8% op de score (gemeten op een synthetische reeks van
      12 weken). Het begint pas te sturen na een stuk of tien campagnes per
      slot, dus na maanden. De loop moet nu gaan verzamelen om later iets
      waard te zijn.

- [ ] **Geen controlegroep.** Weer, evenementen en feestdagen op de doeldatum
      tellen mee in de "lift". Daarom mediaan over meerdere campagnes en een
      kleine begrenzing (±25%, tegenover −60% voor de cool-down). Wie dit
      ooit serieus wil: de datum-factor die de detectie al berekent zou bij
      de meting opgeslagen kunnen worden om voor te corrigeren.

- [ ] **Campagnes zonder `ai_suggestion_id` worden niet gemeten.** Het
      doelmoment staat in `ai_suggestions.trigger_context`;
      `campaigns.scheduled_for` is het verzendmoment en daar is geen dagdeel
      uit af te leiden. Als er veel campagnes buiten de voorstel-flow om
      ontstaan, is een eigen doel-kolom op `campaigns` de volgende stap.

- [ ] **Nog niet zichtbaar voor de eigenaar.** De metingen staan in de tabel
      en sturen de ranking, maar er is geen rapportage-weergave. Bewust niet
      als reden op de kaart gezet ("dit moment werkte eerder") — dat is een
      te stellige claim op drie ruizige metingen. Een rapportage-blok dat de
      lift per slot toont met het aantal metingen erbij is eerlijker.

- [ ] Bron-beperkingen om rekening mee te houden: `events` heeft geen omvang en
      geen einddatum, dus een meerdaags festival matcht alleen z'n startdag en
      "groot" is alleen te benaderen via categorie × afstand. Weer reikt 7 dagen,
      de detectie kijkt 21 dagen vooruit.

- [ ] Observatie, niet gefixt: op realistische patronen komt bijna elk moment als
      `unusual` uit de MAD-drempel, dus de chat zegt bijna altijd "ongewoon
      rustig". Drempel `UNUSUAL_SPREAD_MULT` een keer tegen echte data ijken.


### 🗓️ 2026-09-09 — Backend naar sociale media: analyse + stappenplan (P0/P1)

- [ ] **2. Kanaal-lijsten samentrekken naar één bron** (P1). Nu op 7 plekken
  los: `FillyChannel` (filly-brain.config:52), `ALLOWED_ACTION_CHANNELS`
  (chat.service:1533), de toegestane waarden in de chat-system-prompt
  (chat.service:1459), `ReachChannel` (channel-reach.service:29), `REACH_LABEL`
  (suggestions.service:1450), `CHANNEL_LABEL` + platform→type-mapping
  (campaigns.service:1163) en `ChannelChoice` (filly-chat-choice-card.tsx:38).
  Neem hierin mee: het legacy single-type tool-schema
  (`campaign_type: enum ['social','mail']`, suggestions.service:285) kan
  `google_business` niet aanbieden zolang `campaigns.type` de check-constraint
  `mail|social|whatsapp` heeft — GBP loopt daar nu om heen via het
  platform-pad (`type='social'` + `platforms=['google_business']`). Of de
  constraint verruimen, of dat schema helemaal naar het platform-pad trekken.

- [ ] **4. Kanaalkeuze + voorselectie social-first** (P1). Nu vinkt de geleide
  flow bij "nergens bereik" **mail + Instagram** voor
  (`suggestions.service.ts:1466`). Moet worden: de gekoppelde kanalen, en
  zonder koppeling Instagram + Facebook met een nudge "koppel eerst je
  accounts" i.p.v. stil terugvallen op mail. `ChannelReach` meet voor social
  alleen koppelstatus, geen volgers — volger-aantallen vragen Insights fase 2.

- [ ] **5. Organisch vs. betaald in de flow** (P1). Extra stap met per kanaal
  een toggle + budgetveld dat naar `campaigns.budget_cents` schrijft (die kolom
  bestaat al met comment "v2: voor betaalde ads" en wordt nu 0× gebruikt).
  Vóór `ads_management` als "voorbereid, jij zet 'm live in Ads Manager"; dan
  is de flow al af zodra de scope er is. Voor "kosten per boeking" is nodig:
  budget + spend + reach per uiting (attributie bestaat al).

- [ ] **6. YouTube als platform** (P2). Ontbreekt volledig in de backend: geen
  provider-module (naast `meta/` en `tiktok/`), geen OAuth, geen publish-tak in
  `publishSocialCampaign`, geen `CHANNEL_RULES`-entry (dus geen lengte-band in
  de copy-guard), en `createConceptForPlatform` gooit `'Ongeldig kanaal.'`.
  Eén echte migratie nodig: `campaign_style_fingerprints.channel` heeft een
  check-constraint zonder youtube (`0048:30`), dus anti-repetitie faalt
  fail-soft voor YouTube.

- [ ] **7. Dode code opruimen** (P3). Nul verwijzingen buiten hun eigen
  definitie, geen feature eraan: tabel `campaign_templates`, en in
  `filly-brain.config.ts` de constanten `CHANNEL_MIX_PER_THEME` (schrijft nota
  bene `whatsapp` voor bij `rustige_dag_actie`), `FUNNEL_STAGE_TO_CHANNELS`,
  `RETENTION_ACQUISITION_BALANCE`, `PERSUASION_EXAMPLES`, `DEFAULT_RATE_LIMITS`
  plus de functies `classifyLeadTime`, `planChannelPlacement` en
  `suggestChannelMix`. **Laten staan** (scaffolding of superseded, niet dood):
  `campaigns.budget_cents` (nodig in stap 5), `ab_variant`, `unsubscribe_token`,
  `campaign_recipients` (superseded door `campaign_sends`),
  `campaign_benchmarks` (leeg, `MailStats.benchmark` is hardcoded), `segments` /
  `target_segment_id` (nooit gevuld, segmentatie staat wel op de site).

- [ ] **8. Marketing-hub-statussen omdraaien** (P2). Mail staat op `"live"`,
  Instagram/Facebook/TikTok op `"coming-soon"` en WhatsApp op `"future"`
  (`dashboard/marketing/page.tsx:70`) — omgekeerd t.o.v. de site, terwijl social
  publiceren écht werkt.


### 🗓️ 2026-09-09 — Site praat sociale media, product nog niet (P2, open)

- [ ] **Dashboard meetrekken naar sociale media** (P2). De app-kant praat nog
  over mail en WhatsApp en loopt dus uit de pas met de site. Raakt in elk geval:
  `dash_marketing_mail_page`, de campagne-voorstellen in de Filly-chat
  (`dash__components_filly_chat_proposal_card`: `typeMail`/`typeWhatsapp`),
  de kanaal-labels op de koppelingen-pagina en de "alleen mail-campagnes kunnen
  via deze flow"-melding in de verzend-modal.

- [ ] **YouTube-koppeling aanvragen en bouwen** (P2). Er is nu alleen een
  Meta- (FB/IG) en TikTok-integratie. YouTube vraagt een eigen Google-OAuth-
  koppeling (YouTube Data API, upload-scope) plus API-review. Het merk-logo
  staat al in `brand-logos.tsx` en YouTube staat al op de site.

- [ ] **Betaalde advertenties: `ads_management` aanvragen** (P2). De Meta- en
  TikTok-koppelingen publiceren alleen organisch; er is geen advertentie-
  account, budget of targeting in de code. De site noemt betaald bereik wel
  ("Betaald bereik op de dagen die gevuld moeten worden", Ultimate-pakket,
  FAQ over advertentiebudget). Vergt nieuwe app-review bij beide platforms.

- [ ] **Eigen beeld voor de YouTube-kaart** (P3). `public/visuals/youtube.jpg`
  is nu een kopie van `facebook.jpg`, dus in de social-waaier op de home staat
  dezelfde foto twee keer. Geen webfoto's gebruiken (licentie), Floris levert aan.


### 🗓️ 2026-08-07 — Site-herpositionering: asset-ronde (P3, open)

- [ ] Home feature-visual-kaarten (`components/landing-visuals.tsx`):
  zoekmachine/AI/review (ingebakken ChatGPT/Tripadvisor-logo's) + de 4
  social-foto's (`public/visuals/{facebook,tiktok,instagram,youtube}.jpg`) + de
  thumbnail op de Bereikbaarheid-kaart. De mail/WhatsApp-visual bestaat niet
  meer (2026-09-09).

- [ ] Product-visual-mock (nog horeca: bezetting / 3-gangen / terras).

- [ ] Over-ons-foto's (leeg → vol restaurant) + hun alt-teksten (`about.alt1/2/3`).


### 🗓️ 2026-07-29 — Filly-chat + geleide flow op de dagdeel-detectie (live op main)

- [ ] **Vervolg (bekend), maar LET OP:** dit lost het "elke week dezelfde weekdagen"-probleem NIET op (zie de entry van 2026-09-15) — het verbetert de terugblik, niet de vooruitblik. Anker verschuiven van Google-gemiddelde naar eigen
  gemeten historie per weekdag/uur — pas mogelijk na weken live-data. Nu rollen
  structureel-slechte dagen (ma/wo) elke week terug; dat is inherent aan de
  gemiddelde-bron.


### 🗓️ 2026-07-27 — Rustige momenten per dagdeel (live op main)

- [ ] Visuele check op de ingelogde dashboard (markers, terugbladeren, chat-blokjes).

- [ ] Branch mergen naar main na de visuele check.


### 🗓️ 2026-07-18 — Bezetting: Apify vervangt Outscraper + werkelijk-lijn glad (live op main)

- [ ] Zodra er weken eigen live-data zijn: anker verschuiven van Google's
  generieke patroon naar de **eigen mediaan-per-weekdag/uur** + demping
  losser (evt. adaptief op hoeveelheid historie).

- [ ] Werkelijk blijft een grove bron; voor écht precieze bezetting later
  eigen reserveringen/POS. Cron draait uurlijks (open zaken); check dat de
  live-waarden per uur variëren.

- [ ] Filly-chat/detectie strakker koppelen aan de grafiek (rustige
  dagen/momenten beter bepalen + hoe erop inspelen) — aparte sessie.


### 🗓️ 2026-07-15 — Bezetting: echte databron via Outscraper (fase B, historisch)

- [ ] Werkelijk-lijn vult zich pas met echte historie zodra de uurlijkse
  cron op productie draait (na deze deploy).

- [ ] Snapshot-bloat: nu `raw`+`pattern` bij elke live-tick → later lite
  live-rows / prunen van oude snapshots.

- [ ] Onboarding zet nog `service_periods` → omzetten naar `opening_hours`.


### 🗓️ 2026-07-10 — Dashboard-herontwerp fase 1 (GEMERGED naar main + live)

- [ ] **Echte databron via THIRD-PARTY** (bijv. Outscraper/SerpAPI) achter de
  `getBusyness(placeId)`-seam. Besloten 2026-07-10 na scraper-spike. Levert
  populaire tijden + live als schone JSON, regelt pb/IP/consent. Nog te doen:
  provider kiezen + API-key in env, fetch-adapter, cron.
  - Datamodel staat al: tabel `busyness_snapshots` (migratie gedraaid) =
    per scrape `pattern` (7×24, Google's gemiddelde = "verwacht") + `live_pct`
    (accumuleert tot eigen "werkelijk"-historie). Verwacht = laatste pattern;
    werkelijk = live-metingen per weekdag/uur (mediaan tegen uitschieters).
  - Voor campagne-effect: werkelijk op campagnedag vs mediaan andere
    same-weekdays, met feestdagen/campagnedatums getagd.
  - **Spike-bevindingen (2026-07-10, NIET opnieuw doen — eigen scrape werkt niet):**
    - Consent-wall omzeilbaar met cookie `CONSENT=YES+...; SOCS=CAI` → 200.
    - HTTP-scrape: populaire tijden zitten NIET in de place-pagina (JS-shell) of
      `/maps/preview/place`. Zoek-endpoint (`tbm=map&tch=1&pb=...`) mét de
      VOLLEDIGE populartimes-`pb` geeft de plek terug maar `detail[84]` (de
      populaire-tijden-slot) blijft `null` — Google heeft dit dichtgezet voor
      kale HTTP-verzoeken.
    - Headless browser (Playwright, niet ingelogd): laadt het paneel wél, maar
      toont "You're seeing a limited view of Google Maps" ZONDER
      populaire-tijden-sectie.
    - Conclusie: ze verschijnen alleen in een INGELOGDE Google-sessie
      (ToS-schending, hoog detectierisico, fragiel). Betrouwbaar gratis zelf
      scrapen = niet haalbaar. → **Third-party is de enige realistische route.**
  - Uurlijkse live-meting tijdens openingstijden nodig voor de volledige
    dagcurve (Google geeft geen historische per-dag data, alleen "nu").


### 🔬 2026-06-25 — Platform-audit (developer + UX): flows, robuustheid, dode code

- [~] **Lost-update op `variants[]`-jsonb** — (✅ deels 2026-06-25, dead-code/robuustheid-ronde) optimistisch slot op `editVariant` + `generateMoreVariants` via de bestaande `updated_at` als versie-stempel (`writeVariantsGuarded`): bij een gelijktijdige wijziging volgt een nette 409 ("ververs de pagina") i.p.v. stil overschrijven. Géén migratie nodig. **Rest open:** `selectVariant` (alleen index, lage schade — bewust niet geslot om valse conflicten te vermijden) en `suggested_campaign`-jsonb in `suggestions.service.ts`. Kanttekening: zeldzame valse 409 als een ándere actie (foto-upload) `updated_at` net bumpt → veilige faal (geen dataverlies, alleen verversen).

- [~] **Ongevalideerde cast op Claude tool-output** — (✅ deels 2026-06-25, robuustheid-rest) `ai.service.ts` (beide structured-paden) weigert nu echt-corrupte output (null/primitief/array) met een nette fout i.p.v. een cast die downstream crasht/corrumpeert; afgekapte (max_tokens) output wordt zo ook afgevangen. Leeg object `{}` blijft bewust doorgelaten (callers vangen dat al af, bv. `generateMoreVariants`-retry). **Rest open:** volledige per-caller zod-schema-validatie + `parseSuggestedCampaign()` bij read-vóór-write (grotere refactor, alle AI-callers).

- [ ] **Geleide-flow verliest state bij on-ramp→active wissel** — `filly-chat-message-list.tsx:151-291`: bij het eerste bericht rendert een nieuwe `FillyGuidedFlow`-instantie (andere `key`) → gekozen hoek/aangevinkte context weg; `active_action` herstelt alleen datum/topic/kanalen/step. *(bekend pijnpunt, nog open; hangt aan de grotere flow-refactor)*

- [ ] **restaurant-context slikt query-fouten** — `restaurant-context.service.ts:82,291` + callers met extra `.catch(() => '')`: transient Supabase-fout → leeg context-blok → Filly genereert generiek/gehallucineerd en "slaagt". Fix: query-error onderscheiden van "geen data" en netjes afbreken.

- [ ] **Auth-edge-cases:**

- [ ] Account-delete + handmatige user-delete laten **wees-restaurants** achter (geen FK/trigger) — `account-deletion.service.ts:72`. Fix: DB-trigger op laatste-owner-verwijdering. *(overlapt COO P0 "Test-account FK-cascade")*

- [ ] Invite-`upsert` kan een **owner stil downgraden** naar staff — `team.service.ts:484`. Fix: niet downgraden bij bestaande hogere rol.

- [ ] Uitgenodigd teamlid met gefaalde accept belandt in de **onboarding-wizard** en maakt een eigen restaurant — `middleware.ts:130`. Fix: pending-invite detecteren → banner i.p.v. wizard.

- [~] **Mock-data als echt gepresenteerd** — bezettingspagina is schoon (2026-09-16): `generateMockHourly()`, de hardgecodeerde YoY-deltas en de cohort-tabel zijn weg, de uur-heatmap draait nu op echte live-metingen. ⚠️ **Nog open**: de jaarview-heatmap (`chart-card.tsx:50`, `calendar-card.tsx:224,388`). Dat is dezelfde soort fout — verzonnen cijfers zonder markering, voor élke klant hetzelfde — en het blijft het punt waar een testklant het snelst z'n vertrouwen op verliest.

- [~] **Modals zonder `aria-labelledby`/focus-trap/Escape** — (✅ grotendeels) UX-ronde 3 (2026-06-25): review-antwoord, "maak eigen campagne"-builder, media-pop-up (campagne-detail). UX-ronde 4 (2026-07-01): `role="dialog"` + `aria-modal` + `aria-labelledby` + Escape op delete-modal (account), invite-modal (team) en media-library-picker; history-restore had al `role="menu"` + Escape. **Rest open:** alleen nog **focus-trap** (focus binnen de modal houden) — bewust apart, vereist een gedeelde trap-helper.

- [ ] **Responsive-gaten** — uur-heatmap, brede tabellen (gasten/bezetting), `aspecten-tabel.tsx:134` (5 koloms nowrap op ~380px), `missende-aspecten-card.tsx:325` (`marginLeft:126` off-canvas), chat-choice-cards `repeat(2,1fr)`, identiteit-savebar `left:220` (hardcoded sidebar-breedte).

- [~] **Pending/accept/dismiss-flow vrijwel dood** — de dode voorstel-berekening op het campagnebord is weg (2026-09-16) en een mislukte goedkeuring faalt niet meer in stilte: die wordt gelogd én gemeld aan de eigenaar. ⚠️ **Nog open**: `acceptProposal`/`acceptBundle` en de "Nee bedankt"-knop (`filly-chat.tsx`, persisteert niets) lopen nog steeds niet. Eerst bevestigen of historische pending-kaarten voorkomen, dan opruimen.

- [ ] **Legacy FORMAAT-parsers** (`chat.service.ts:1547`) draaien elke chat-beurt als "vangnet". *(BEWUST NIET verwijderd 2026-06-25: de parse-tak draait nog elke beurt; verwijderen vereist eerst verifiëren dat geen enkele render-/historie-pad op de oude kaarten leunt. Net als bij `approveMultiChannel` — dat "dood" leek maar via `approve()` wordt aangeroepen — eerst zorgvuldig narekenen. Aparte stap.)*

- [ ] **`findBundle` N+1** (`campaigns.service.ts:674`) + serial N+1 in `channelCampaignsInGroup` (`:1230`). *(bewust uitgesteld 2026-06-25: draait al parallel en bundels zijn ≤6 kanalen → geen reële last; de queries scopen wél netjes op `restaurant_id`. Batch-`IN` blijft de nette fix zodra >10-kanaal-bundels bestaan.)*


### 🗓️ 2026-06-24 — Campagne-detail "foto-interface" + kanaalbeheer + publiceer-flow (live op main)

- [ ] **Filly geleide flow leeft náást het chat-model** — de flow is een parallel UI-spoor dat z'n stappen niet als chatberichten vastlegt (alleen de losse `active_action` + component-state). Daardoor blijft 'm fragiel (state na-ijlen, weinig historie). Grotere refactor: de flow-stappen/resultaat als compacte chat-gebeurtenissen vastleggen zodat "terugkomen" = "je gesprek terugzien". *(architectuur, los plannen)*


### 🔬 Audit-ronde 2026-06-18 — 4 expert-analyses (Prio / Frontend / Backend / Beveiligingen)

- [ ] 🔴 **Conversie publieke site**: vertrouwenssignalen (reviews/logo's/cijfers) toevoegen + de volledig geblurde prijzen-pagina oplossen. *(Frontend/UX)*

- [ ] 🔴 Typografieronde ~12% af: 130 hardcoded px font-sizes vs 18 token-uses in `landing.css` (hero 74, `.pillars-cta-title` 32, `.pricing-price` 38, `.diff-card-title` 24…) → koppen op `--fs-*`, nieuwe `--fs-hero`-token.

- [ ] 🟡 Drie/vier verschillende "primaire groene knop"-implementaties (`.btn-primary`/`.nav-demo`/`.cta-btn`/`.pricing-btn`); `ui.css` Button nergens hergebruikt → één `.btn`/`<Button>`.

- [ ] 🟡 Breakpoint-sprawl (560/640/720/760/820/860/880/980; blog 860 ≠ nav 880) → consolideren naar 880/640/480.

- [ ] 🟡 `font-weight: 800` buiten de schaal + 113 raw weights + ~50 hardcoded brand/status-hex → `--font-weight-*` / `--color-*`.

- [~] 🟢 Logo nav 44px vs footer 35px + dode `.nav-logo-mark`-selector; kaart-radii driften 12/16/20/24/32 → radius-tokens. **(deels ✅ 2026-06-22)** — dode `.nav-logo-mark`-selector verwijderd. Logo-groottes bewust níet gelijkgetrokken (header > footer is een normale design-keuze, geen bug). Kaart-radii-tokens nog open.

- [ ] 🔴 `campaign-send-modal.tsx` volledig inline-styled mét niet-bestaande var-namen + foute hex-fallbacks (`var(--danger,#B3261E)`, `var(--tl,#6B6F71)`) → bestaande `.sg-modal` hergebruiken.

- [ ] 🔴 `UpcomingActionsBlock` herbouwt de alert-bar inline met hardcoded `RED/GREEN` + alias-misbruik `--rs` → `.alert-bar`-class met `--color-danger/-brand`.

- [~] 🔴 `:focus-visible` vrijwel afwezig (1 regel); klikbare `.cal-cell`/`.yr-cell` zijn `<div>` zonder role/tabindex → focus-outline + echte buttons. **(deels ✅ 2026-06-22)** — focus-outline nu site-breed gedekt via de gedeelde `globals.css`-baseline; resteert: `.cal-cell`/`.yr-cell` echte `<button>` maken (role/tabindex) zodat de ring ook iets selecteert.

- [ ] 🟡 Twee parallelle knop-systemen; `<Button>` in maar 6/32 componenten (pill vs rounded-rect inconsistent) → migreren.

- [ ] 🟡 Type-/shadow-tokens vrijwel ongebruikt (243 raw px, 0× `--font-size-*`, 0× `--shadow-*`, .5px-uitschieters) → tokens.

- [ ] 🟡 379 inline-`style={{}}`-blokken; `hour-heatmap` heeft geen mobiele behandeling (geen `@media`) → naar classes.

- [ ] 🟡 Geen gedeelde skeleton (2 implementaties + stale `fillyShimmer` + hardcoded `#efeae0`) → één `<Skeleton>`.

- [ ] 🟢 Heatmap-tiers 3× gedefinieerd (CSS 2× + JS) → `--heat-0..4`-tokens; `880px` stray-breakpoint + `!important` op `.stats-row`-grid opruimen.

- [ ] 🔴 Geen vertrouwenssignalen op de publieke site (reviews/logo's/cijfers) — grootste conversielek → social proof boven de CTA.

- [ ] 🔴 Prijzen-pagina volledig geblurd (`HIDE_PRICING`) en doodlopend → prijs-range of eerlijke uitleg + directe CTA.

- [~] 🟡 Inconsistente CTA-labels ("Vraag een demo aan"/"Plan een gratis kennismaking") → **VERVALT**: variatie is een bewuste keuze (zie beslissing/auto-memory "CTA-labels bewust gevarieerd"), niet consolideren.

- [~] 🟡 Disabled knoppen ogen klikbaar + vage labels in de guided flow. **Labels ✅ 2026-07-01**: "Selecteer een optie" → "Kies minstens één kanaal", "Geen kiezen" → "Wis selectie" (NL+EN). **Rest open**: disabled knoppen ogen nog klikbaar → duidelijker disabled-stijl.

- [ ] 🟡 Concept-werk verloren bij weg-navigeren (review-reply) + geen succes-toast na goedkeuren → sessionStorage-autosave + toast met undo.

- [ ] 🟡 Campagne-detail: inconsistente actie-labels ("Terugtrekken" vs "Terug naar concept"), geen tijdzone-hint bij plan-veld, geen onopgeslagen-markering op de kanaal-tab.

- [ ] 🟡 `runScheduledSocial`: status-flip + publish niet transactioneel, geen overlap-guard → status-flip vóór de side-effects of een `rpc()`-transactie.

- [ ] 🟡 Read-modify-write op `variants`-jsonb zonder locking (lost update) in `selectVariant`/`editVariant`/`mutateChannel`/`refine` → `jsonb_set` via `rpc()` of `version`-kolom.

- [ ] 🟡 Multi-channel status-transitie zonder rollback — **(bevestigd, al P1)**.

- [ ] 🟡 Legacy `FORMAAT`-parsers + dead-code-kolommen (`filly_variants` e.d.) + dode API-functies — **(bevestigd, al P1 + Filly-audit #7)**.

- [ ] 🟢 ~62 zwakke types (`any`/`as`/`Record<string,unknown>`) in `apps/api` → per-tabel rij-types of lichte zod-validatie bij het inlezen.

- [ ] 🟢 `findBundle` N+1 (per kanaal `findById`) — *(bewust uitgesteld 2026-06-25: al parallel, ≤6 kanalen, scopet op `restaurant_id`; batch-`IN` pas nodig bij >10-kanaal-bundels.)*

- [ ] 🟡 Publieke `/public/contact` + `/public/unsubscribe` zonder rate-limit/CAPTCHA → IP-rate-limit (Vercel WAF) op `/public/*`.

- [ ] 🟡 Storage-bucket `restaurant-assets` mist per-tenant path-RLS (tenant A kan in B's pad schrijven) → pad-prefix-RLS op `(storage.foldername(name))[1]`.

- [ ] 🟡 Pre-onboarding rate-limit in-memory (niet multi-instance-veilig) — **(bevestigd, al P1)** → gedeelde store (Supabase-tabel/Redis).


### 🌍 Internationalisering NL/EN (gestart 2026-06-19, branch `feat/i18n`)

- [ ] **Bug: hero-apparaat-mockups op de homepage nog NL op `/en`** — de hero-
  tekst (titel/subtitle/CTA's) en "Waarom het werkt" zijn vertaald, maar de
  mockups ín de hero tonen nog hardcoded Nederlands: het laptop-scherm
  (`MiniDashboard` in `app/[locale]/page.tsx`) + de telefoon (`LandingPhone`)
  en `LandingFillyChat` (`components/landing-*.tsx`). Strings extraheren naar de
  `home`-namespace + `t()`. (Geconstateerd door Floris op iPhone + laptop, 2026-06-21.)

- [ ] Follow-up (los): Next 16 deprecate't `middleware` → `proxy` (warning in build);
  bewust níet in i18n-werk meegenomen (verandert runtime edge→nodejs op auth-pad)

- [ ] **Filly-Engels doortrekken naar de rest van de AI-output** — campagne-
  generatie, review-replies, geleide flow (generate-for-dates), suggesties en
  e-mails laten dezelfde `filly_language`-kolom lezen en hun prompts in het
  Engels laten schrijven. Zelfde kolom, andere prompt-plekken (o.a.
  `campaigns`-service, `suggestions`-service, review-reply-prompt, mail-templates).


### 🔧 Filly-flow developer-audit (2026-06-12) — één voor één afwerken

- [ ] **7. Legacy dood gewicht opruimen** — de oude FORMAAT-parsers (`extractCampaignProposal/Bundle/Choice/DateChoice`) + chat-kaarten staan er nog "als vangnet" maar het LLM emit ze niet meer: bewust verwijderen óf documenteren waarom ze blijven. Idem `row: Record<string, unknown>` in `generateForSelectedDates` → echt type geven.


### Audit 2026-04-29 — Bevindingen per rol

- [ ] 🟡 **`ai_usage` tracking heeft geen dashboard** — Claude-kosten zijn alleen via DB-query zichtbaar. Mini-page voor admin om kosten per restaurant te zien.

- [ ] 🟢 **Geen Plausible/PostHog** op publieke site — onbekend waar bezoekers afhaken.

- [ ] 🟡 **Pre-onboarding rate-limit is in-memory Map** → overleeft geen multi-instance deploy. Naar Redis/Upstash.

- [ ] 🟡 **Geen tests behalve `app.controller.spec.ts`** — 8.500 regels backend, één spec. Minimaal smoke-tests op auth + tenant-isolatie + key endpoints.

- [ ] 🟡 **WebsiteAnalyzer + MenuImporter zijn synchroon** (5-15s blocking). Bij gelijktijdige uploads loopt Node-process vast. Job-queue (BullMQ + Redis) toevoegen.

- [~] 🟡 **TODO's in code** — kpi.service.ts (weekday-avg) staat nog open. kpi-row.tsx (FILLY_MOCK) en suggesties/page.tsx (getMockProposal) zijn beide opgeruimd 2026-04-29 / 2026-04-30.

- [ ] 🟢 **Inline styling overal** — `style={{...}}` in elke component. Refactor naar Tailwind / CSS-modules voor onderhoudbaarheid op schaal.

- [ ] 🟢 **`@RequireModule`-decorator** voor module-permissies ontbreekt (alleen frontend-filtering).

- [~] 🔴 **20 migraties handmatig** — setup-guide in [docs/archief/database-migrations.md](docs/archief/database-migrations.md). **Jouw actie**: Supabase CLI installeren + `supabase migration repair` runnen om bestaande migraties als applied te markeren.

- [~] 🔴 **Sentry / error-tracking** — setup-guide in [docs/archief/sentry-setup.md](docs/archief/sentry-setup.md). **Jouw actie**: account aanmaken + 2 projecten + DSN's invullen.

- [~] 🔴 **Cost-alerts Anthropic** — setup-guide in [docs/archief/anthropic-cost-alerts.md](docs/archief/anthropic-cost-alerts.md). **Jouw actie**: monthly spending limit + alerts in Anthropic Console + aparte API-keys per environment.

- [~] 🟡 **Staging-omgeving** — setup-guide in [docs/archief/staging-setup.md](docs/archief/staging-setup.md). **Jouw actie**: 2e Supabase-project + 2e Railway-instance + Vercel preview-branch.

- [ ] 🟡 **Geen feature-flag systeem** — bij 1000+ klanten kan een release niet veilig naar 5% eerst.

- [~] 🟡 **Multi-instance scaling roadmap** — gedocumenteerd in [docs/archief/scaling-roadmap.md](docs/archief/scaling-roadmap.md). Concrete actie pas nodig bij ~100+ klanten (Redis voor rate-limits, BullMQ voor zware AI-calls).

- [ ] 🔴 **Stripe-billing ontbreekt** (was Mollie; besluit 2026-05-30 = Stripe) — eerste klant kan niet betalen. 4 sub-taken: SDK + checkout, subscriptions-tabel, plan-enforcement, webhook. Zie P0 → Billing.

- [~] 🔴 **Privacy-verklaring + AV** — dynamisch rendering live (2026-04-30) via `apps/web/src/config/company.ts`. Banner verdwijnt zodra `legalName + kvk` ingevuld zijn. **Jouw actie**: KvK-inschrijving + bedrijfsgegevens invullen in `config/company.ts` + jurist-review boeken.

- [ ] 🔴 **Geen "Start trial / Probeer gratis"-flow** vanaf pricing-pagina.

- [ ] 🟡 **Geen referral / vriend-werft-vriend**-systeem.

- [ ] 🟢 **Concurrent-positionering** (vs. Resengo/Zenchef) onduidelijk in marketing.

- [ ] 🔴 **Geen interne admin-tooling** — klant-support gebeurt via Supabase Studio. Onhoudbaar bij 50+ klanten.

- [ ] 🔴 **Test-account opruimen heeft FK-cascade-gotcha** — auth.user delete laat wees-restaurants achter.

- [ ] 🟡 **Geen klanten-dashboard** ("welke klanten hebben KvK ingevuld? wie heeft Filly nooit gebruikt?").

- [ ] 🟡 **Geen incident-response runbook** — wat doe je als Claude API down is, Supabase storage faalt?

- [ ] 🟡 **Geen rate-limit per user op AI** (alleen 100/uur/restaurant). Eén user kan binnen 1 uur €5-10 verbranden.

- [ ] 🟢 **Geen monitoring** Claude/Supabase uptime — storingen alleen via klant-mails.

- [~] 🟡 **Inline styling overal — design-tokens-laag toegevoegd** (2026-04-30 fase 1+2+3) — `tokens.css` is nu single source-of-truth (kleuren, spacing, radii, shadows, typography). globals.css + dashboard.css duplicaten weg; oude korte aliases (`--ts`/`--bl`/`--blue`/`--r`) blijven werken via aliases. Spacing-pas op dashboard-home + account-formulieren naar 8px-grid. **Nog open**: incidenteel inline `style={{...}}` vervangen wanneer je toch in een file zit.

- [~] 🟡 **Iconen-set is volledig emoji** (2026-04-30) — Lucide-react geïnstalleerd; selectief gemigreerd voor functionele controls (chat-send, modal-close, photo-replace, topbar burger/bell/search). Brand-decoratieve emoji's (✨ Filly-sparkle, 📷, 📄, 🍷, ⚠️ + sidebar-iconen) blijven bewust staan.

- [ ] 🟡 **Geen focus-states / aria-labels** op veel knoppen → WCAG-toegankelijkheid onder de maat.

- [ ] 🟢 **Geen dark-mode**, geen i18n-voorbereiding (alles hard-coded NL).

- [~] 🟢 **Geen Storybook / design-systeem documentatie** (2026-04-30) — light-weight reference-pagina op `/dashboard/design-system` toont alle tokens + 8 base-components (Button/ButtonLink/Badge/Card/PageHeader/EmptyState/Tabs/Input+Textarea) met live demos. Echte Storybook later als de component-library groeit.


## Hoe deze lijst te gebruiken

1. **Bij elke werksessie** open je eerst deze file — bepaal samen met
   Claude de volgende stap.
2. **Nieuwe bevinding?** Schrijf 'm hier meteen op, ook al heb je geen
   tijd om 'm nu op te lossen. Vergeten = weer opnieuw ontdekken.
3. **Iets klaar?** Zet op `[x]` + voeg commit-hash toe tussen `~~tildes~~`
   voor zichtbare voortgang. Verplaats naar "Recent voltooid" als de
   sectie te vol wordt.
4. **Prioriteit verandert?** Verplaats naar juiste P0/P1/P2/P3-sectie.
5. **Commit deze file mee** bij elke wijziging — geen aparte PR.
