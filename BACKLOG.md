# Get Filly — Backlog

Centraal overzicht van openstaande punten. **Werk deze lijst bij** zodra
iets klaar is, of wanneer je iets nieuws tegenkomt dat later aandacht
nodig heeft. Dit is dé referentie voor elke werksessie — zowel voor
jou als voor Claude in nieuwe chats.

## Prioriteiten

- **P0** — Blokkerend voor eerste klant live
- **P1** — Productie-hygiëne (moet vóór publieke launch)
- **P2** — Feature-werk (mock → echt)
- **P3** — UX-verfijningen / nice-to-have

Status-markers: `[ ]` = todo · `[~]` = in progress · `[x]` = done

---

## P0 — Blokkerend voor eerste klant

### Auth & onboarding
- [ ] **Signup → auto-restaurant-creatie** — nu landt een nieuwe user op een leeg dashboard zonder restaurant. Backend-endpoint + onboarding-wizard nodig.
- [x] ~~Password-reset flow~~ — `/forgot-password` + `/reset-password` live (2026-04-24). Supabase email-template "Reset Password" moet verwijzen naar `/auth/confirm?type=recovery&next=/reset-password` — zie docs/supabase-manual-setup.md.

### Legal & compliance (AVG/NL)
- [ ] **Privacy-verklaring** — `/privacy`-route + inhoud, link in footer
- [ ] **Algemene voorwaarden** — `/voorwaarden`-route + inhoud
- [ ] **Cookie-banner** — ePrivacy-verplicht
- [ ] **AVG-endpoints** — data-export + right-to-be-forgotten

### Billing
- [ ] **Mollie-integratie** — SDK installeren, checkout-flow op pricing-pagina
- [ ] **Migratie `subscriptions`-tabel** — plan + status + mollie_customer_id
- [ ] **Plan-enforcement** — limieten per plan (AI-calls, campagnes, teamleden) afdwingen in backend
- [ ] **Mollie webhook** — status-changes opvangen (trial → active → cancelled)

---

## P1 — Productie-hygiëne

### Infrastructuur & deploy
- [ ] **vercel.json voor web** — deploy-config
- [ ] **Railway/Render config voor api** — Dockerfile of native buildpack
- [ ] **Password-protected preview-deploy** op `app.get-filly.com` — eerste live URL waar we Meta-OAuth + echte tests kunnen doen
- [ ] **Staging-Supabase** — aparte DB voor tests/Meta-review zonder productie-risico
- [ ] **GitHub Actions CI** — type-check + lint + build op elke PR

### Monitoring & analytics
- [ ] **Sentry** — error-tracking backend + frontend
- [ ] **Plausible** (of PostHog) — analytics op publieke site + dashboard
- [ ] **Cost-alerts Anthropic** — mail als daglimiet overschreden

### Security hardening (multi-tenant, 1000+ klanten)
- [ ] **Per-request Supabase-client met user-JWT** — defense-in-depth op RLS. Nu bypasst backend RLS via service_role.
- [ ] **`@RequireModule`-decorator** — backend enforced per-module permissies (nu alleen frontend-filter op sidebar)
- [ ] **Audit-log vullen** — tabel `audit_log` bestaat sinds migratie 0001, maar wordt nergens geschreven
- [ ] **Email-change flow** — account-pagina
- [ ] **2FA setup** — `users.two_factor_enabled` kolom bestaat, geen UI

### Site-fundamenten (publieke site)
- [ ] **Contact/waitlist-formulier** — Resend-integratie voor notificaties
- [ ] **404-pagina** — custom error-page
- [ ] **sitemap.xml** — SEO
- [ ] **robots.txt** — SEO
- [ ] **og-images per pagina** — social shares
- [ ] **About-pagina invullen** — nu leeg/placeholder
- [ ] **Footer invullen** — nu grotendeels leeg

---

## P2 — Mock-features naar echt

### Filly AI-features (backend + prompts)
- [x] ~~Review-reply-suggesties via Claude~~ (2026-04-23, commit `bd03246` + `21314d9`)
- [x] ~~Filly-chat v1 met persistente historie~~ (2026-04-23, commit `53db975`)
- [x] ~~Filly-chat v2 met live restaurant-context~~ (2026-04-23, commit `0f0e1b3`)
- [ ] **Suggesties-generator** — `getMockProposal()` in [suggesties/page.tsx](apps/web/src/app/dashboard/suggesties/page.tsx) vervangen door Claude-call met `RestaurantContextService` + menu_items
- [ ] **Menu-kaart Vision-upload** — foto/PDF menukaart → Claude Vision → menu_items. Migratie `menu_uploads`-tabel + Storage-bucket nodig.
- [ ] **Menu CRUD endpoints** — POST/PATCH/DELETE op `/api/menu`. Nu alleen GET; frontend houdt wijzigingen in local state.
- [ ] **Prompt caching activeren** — `cache_control: { type: 'ephemeral' }` op system-prompts zodra die stabiel >1024 tokens zijn
- [ ] **Auto-title-generation voor chat-conversations** — `chat_conversations.title` blijft nu null

### Email & campagnes
- [ ] **Resend SDK installeren + auth-mails** — custom templates i.p.v. Supabase default SMTP
- [ ] **Campagne-send engine** — POST `/api/campaigns/:id/send` + Resend bulk + bounce-handling
- [ ] **Migratie `campaign_sends`-tabel** — history + unsubscribe-tokens
- [ ] **Unsubscribe-route** — GDPR-verplicht

### Integraties (OAuth)
- [ ] **Facebook/Instagram OAuth** — Meta Graph API, `pages_manage_posts` + `instagram_content_publish` (vereist App Review, 2-8 weken)
- [ ] **Google Business Profile** — reviews importeren + posten
- [ ] **Zenchef OAuth** — reserveringen syncen
- [ ] **OpenTable / SevenRooms / Resengo** — volgorde bepalen met klantvraag
- [ ] **TripAdvisor / The Fork / IENS** — reviews importeren
- [ ] **Webhook-receivers** per integratie met rijtests

### Mock-data in frontend (opruimen zodra backend er is)
- [ ] **`FILLY_MOCK`** in [kpi-row.tsx:27](apps/web/src/app/dashboard/_components/kpi-row.tsx) — KPI-subregels "door Filly"
- [ ] **`isFromFilly()`** — deterministische hash in reserveringen + gasten
- [ ] **`FILLY_ROI_6M` + `FILLY_BY_TYPE`** in rapportages-pagina
- [ ] **`buildFillyReply()`** — al vervangen, alleen `MOCK_RECOGNIZED` in menu-pagina rest nog
- [ ] **`cardItemIds`-set in memory** in menu-pagina
- [ ] **Statische koppelingen-lijst** zonder OAuth-flow

### Database-migraties nog te maken
- [ ] **`menu_uploads`** + Storage-bucket `menu-uploads` + FK `menu_items.menu_upload_id`
- [ ] **`reservations.via_campaign_id`** FK (Filly-ROI meetbaar maken)
- [ ] **`guests.acquired_via_campaign_id`** FK
- [ ] **`campaigns.metrics` uitbreiding** — extra_reservations/revenue/retention
- [ ] **`subscriptions`** (billing)
- [ ] **`campaign_sends`** (email-history)
- [ ] **`guest_segments`** (doelgroep-segmentatie)

---

## P3 — UX-verfijningen

### Chat
- [ ] **Nieuw-gesprek-knop** in filly-chat + seed-cleanup (oude mock-berichten uit 0001 opruimen)
- [ ] **Chat-geschiedenis overzicht** (meerdere threads per restaurant)
- [ ] **Streaming** — woord-voor-woord antwoorden (SSE)

### Dashboard algemeen
- [ ] **Command palette** (Cmd+K)
- [ ] **Notifications-bell** werkend
- [ ] **Keyboard shortcuts** overzicht
- [ ] **Export CSV/PDF** per pagina (gasten, reserveringen, rapportages)
- [ ] **Mobile responsive pass** — nu desktop-only
- [ ] **i18n (EN)** — engels voor internationale klanten later

### Onboarding nieuwe klant
- [ ] **Welkomst-wizard** — 3-staps flow (profiel → integraties → team)
- [ ] **Sample-data toggle** — demo-data voor nieuwe accounts
- [ ] **Setup-checklist** op dashboard tot alles klaar staat

---

## Test-data & seeds

- [x] ~~`apps/api/supabase/seeds/test_restaurants.sql`~~ — exacte inhoud uit Supabase gekopieerd (commit `TBD`). Snippet in Supabase SQL-editor mag weg.
- [ ] **Mock-chat-berichten uit 0001-seed opruimen** — momenteel zien we die donderdag/38% demo-conversatie op het dashboard van Bistro Get-Filly
- [x] ~~`test_campaigns.sql` in seeds~~ — niet nodig: bleek bij inspectie gewoon een duplicaat van migratie 0005 (reservations + reviews schema+seed). Snippet in Supabase mag weg.

---

## Bekende kleine bugs / TODO-markers in code

Grep periodiek op `TODO`, `FIXME`, `MOCK`, `mock` in `apps/` om bij te
werken. Laatste audit: 2026-04-23.

- [ ] `/apps/web/src/app/dashboard/_components/filly-chat.tsx` — oud comment "Mock-antwoord. Later vervangen door echte Claude API call" is niet meer relevant sinds commit 53db975 maar de file-structuur verdient een review-pass
- [ ] `/apps/web/src/app/dashboard/account/page.tsx` — bevat nog "Komt beschikbaar zodra de Claude API gekoppeld is"-melding die nu niet meer klopt

---

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

## Recent voltooid (2026-04-23)

- ✅ `0009_ai_usage.sql` — migratie voor Claude-call tracking
- ✅ `AiService` centrale wrapper + `AiCallMeta`-type dwingt tracking af
- ✅ `AiRateLimitGuard` — 100 calls/uur/restaurant
- ✅ Review-reply-suggesties via Claude (toon B, geen handtekening)
- ✅ 3-varianten-kiezer in reviews-modal met page-level persistence
- ✅ Filly-chat met persistente `chat_messages`-historie
- ✅ `RestaurantContextService` — herbruikbaar context-blok voor alle Filly-prompts
- ✅ Chat v2: live weer + bezetting + reserveringen in system-prompt
- ✅ `CLAUDE.md` bijgewerkt (was 2 dagen oud, refereerde nog aan oude huisstijl en migraties 0001-0005)
- ✅ `docs/supabase-manual-setup.md` — alles wat niet in migraties staat: email-templates, redirect-URLs, storage-buckets, env-vars, verificatie-queries
- ✅ `apps/api/supabase/seeds/test_restaurants.sql` (reconstructie) + seeds-README
