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
- [ ] ⚠️ **Email-confirmation weer aanzetten** — tijdelijk UIT gezet tijdens dev (Supabase Dashboard → Authentication → Providers → Email → "Confirm email"). **Aanzetten vóór productie-launch** anders accepteert de app fake-signups. Los op met Resend SMTP (hieronder) zodat je niet meer tegen rate-limits aanloopt en je dit weer aan kunt hebben in dev.
- [~] **Geocoding bij adres-invoer** — GeocodingService via PDOK Locatieserver (gratis, EU, officiële NL-bron) live sinds 2026-04-24. Onboarding haalt nu lat/long op direct na restaurant-insert. **Nog te doen**: (1) eenmalig backfill-script voor bestaande restaurants zonder coords, (2) geocode opnieuw triggeren bij adres-wijziging op account-pagina (zodra die bestaat).
- [x] ~~Empty-states-sweep dashboard~~ (2026-04-29) — alle dashboard-pagina's tonen nu rustige empty-states i.p.v. rode HTTP-banners. Geraakt: KpiRow, WeatherForecast, suggesties, campagnes-detail, account, rapportages (volledige empty-state voor nieuwe klanten zonder data), reviews (verwijst naar koppelingen-pagina). Form-validation rood-kaders (reserveringen-modal, review-reply-modal) blijven rood — passend voor user-action-fouten.
- [x] ~~Signup → auto-restaurant-creatie~~ — `/onboarding`-wizard live (2026-04-24, commit `5d888c9`)
- [x] ~~Password-reset flow~~ — `/forgot-password` + `/reset-password` live (2026-04-24, commit `335f5a1`)
- [x] ~~Wachtwoord-eisen + confirmatie-veld~~ — signup en reset-password gebruiken herbruikbaar `<PasswordStrength>` component met live checklist (8+ tekens, letter, cijfer, speciaal teken). Submit disabled tot groen (2026-04-24, commit `15fe843`).
- [x] ~~Supabase email-templates geautomatiseerd~~ — `pnpm supabase:apply-templates` PATCHt alle 4 templates (invite, magic-link, recovery, confirmation) via Management API. Geen handwerk meer in dashboard. (2026-04-24, commit `2775f08`)
- [x] ~~Onboarding met Filly-auto-invul~~ — URL + menukaart → Filly vult hele profiel in (description, tagline, atmosphere, target_audience, USPs, events, signature_dishes, cuisine_style, adres, toon) + menu-items via Opus Vision. Wizard: bronnen → review → bevestig (2026-04-24, commits `b29f317` + `d909c65`).

### Legal & compliance (AVG/NL)
- [~] **Privacy-verklaring** — `/privacy` concept-v1 live (2026-04-24). **Per 2026-04-30**: dynamisch rendering geactiveerd via `apps/web/src/config/company.ts` + `<LegalField>`. Banner + placeholders verdwijnen automatisch zodra `legalName` + `kvk` zijn gevuld. Nog te doen: (1) bedrijfsgegevens invullen in `config/company.ts` zodra KvK-inschrijving rond is, (2) jurist-review.
- [~] **Algemene voorwaarden** — `/voorwaarden` concept-v1 live (2026-04-24). **Per 2026-04-30**: dynamisch rendering via `config/company.ts` (zelfde flow als privacy). Nog te doen: (1) bedrijfsgegevens + rechtbank + aansprakelijkheidsmax invullen in `config/company.ts`, (2) jurist-review, (3) aparte verwerkersovereenkomst opstellen (wordt in de AV naar verwezen).
- [ ] **Jurist-review legal-teksten** — laten reviewen door privacy/SaaS-jurist vóór eerste klant. Met name: aansprakelijkheidslimiet, SLA-claim, IP-clausule AI-output, prijswijzigings-clausule.
- [x] ~~**Cookie-banner**~~ (2026-04-29) — `<CookieBanner />` in root-layout, accept/reject in localStorage. Klaar voor wanneer Plausible/PostHog erbij komt (analytics-init achter consent-check).
- [x] ~~**AVG-endpoints** — data-export~~ (2026-04-29) + ~~right-to-be-forgotten (account-delete)~~ (2026-04-30). Account-delete via `DELETE /restaurant/me/account` met `{ confirmation: "VERWIJDER" }`-body. UI-knop op account-pagina sectie "Data & privacy". Verwijdert auth.users + alle owner-restaurants → cascade business-data; blokkeert als andere team-members bestaan. Bewijs-rij in `account_deletions`-tabel (geen PII).
- [~] **Data-classificatie + anonimisering-bij-delete** — fase 1 live per 2026-04-30: continue benchmark-anonymisering bij `campaign.status → afgerond` schrijft een rij in `campaign_benchmarks` (cuisine + region=provincie + capacity-bucket + month + theme + result-metrics, géén body, géén FK, GDPR Recital 26). Laatste-vangnet bij delete via `AnonymizationService.benchmarkAllCompletedFor()`. **Fase 2 nog open**: (1) body-templates extraheren met LLM-stripping van eigennamen, (2) menu-pattern-aggregatie, (3) `docs/data-classification.md` met per-tabel-categorie, (4) Filly's prompts verrijken met benchmark-queries.

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
- [x] ~~**Audit-log vullen**~~ (2026-04-30) — alle 6 service-domeinen schrijven nu naar `audit_log` met echte `userId`. Zie Data Analyst-sectie voor exhaustief overzicht.
- [ ] **Email-change flow** — account-pagina
- [ ] **2FA setup** — `users.two_factor_enabled` kolom bestaat, geen UI
- [ ] **Pre-onboarding rate-limit naar Redis** — nu in-memory Map in `OnboardingController`. Overleeft geen multi-instance deploy; vervangen door Redis/Upstash zodra api op Railway schaalt.

### Email & campagnes (gepromoveerd van P2 → P1)
- [ ] **Resend als SMTP-provider voor Supabase Auth** — configureer Resend onder Supabase Auth → SMTP Settings. Lost de 3-4/uur rate-limit op Supabase default SMTP en maakt confirmation-email weer bruikbaar in dev. Onze custom templates blijven werken; Supabase stuurt ze via Resend i.p.v. eigen SMTP.

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

### Campagne-concept-UX (ideeën vanuit Floris-ronde 2026-04-24)
- [~] **3 varianten genereren per suggestie** — gedaan 2026-04-25. Filly genereert 3 versies per chat-proposal, modal toont ze naast elkaar met selectie + refine + goedkeuren. Approve gebruikt geselecteerde variant.
- [ ] **Media-upload op concept-campagne** — voor social/WhatsApp: upload eigen foto OF kies uit eerder goed-werkende afbeeldingen ("gebruik dezelfde foto als vorige campagne"). Preview-block vervangt de huidige 📷-emoji-placeholder.
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

### Email & campagnes
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
- [x] ~~**`FILLY_MOCK`** in kpi-row.tsx~~ (2026-04-29) — verwijderd, alleen echte attributie via `reservations.via_campaign_id`-FK.
- [x] ~~**`isFromFilly()`**~~ (2026-04-29) — kolom + stat-card weg uit gasten-pagina; reserveringen-pagina nu op echte `source`-veld.
- [x] ~~**`FILLY_ROI_6M` + `FILLY_BY_TYPE`** in rapportages~~ (2026-04-29) — vervangen door echte 6-mnd grafiek + per-campagne tabel.
- [x] ~~`buildFillyReply()` in reviews~~ — vervangen door echte Claude-call (2026-04-23)
- [x] ~~`MOCK_RECOGNIZED` in menu-pagina~~ — vervangen door echte Vision-analyse tijdens onboarding.
- [x] ~~`getMockProposal()` in suggesties-detail-modal~~ (2026-04-30) — vervangen door echte Claude-call via tool-use op `/api/suggestions/:id/proposal-details`.
- [ ] **`cardItemIds`-set in memory** in menu-pagina — UI-state voor net-toegevoegde items, hoort uit DB-flow te komen.
- [ ] **Statische koppelingen-lijst** zonder OAuth-flow (op /dashboard/koppelingen)

### Database-migraties nog te maken
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
- [ ] **`campaign_sends`** (email-history)
- [ ] **`guest_segments`** (doelgroep-segmentatie)

---

## P3 — UX-verfijningen

### Chat
- [x] ~~**Nieuw-gesprek-knop** in filly-chat + seed-cleanup~~ (2026-05-01) — `+ Nieuw gesprek` in dropdown + automatische CTA bij cap-bereikt. Seed-cleanup via migratie 0028 (`delete from chat_conversations where created_at < '2026-01-01'`).
- [x] ~~**Chat-geschiedenis overzicht**~~ (2026-05-01) — `FillyChatHistoryMenu` dropdown in chat-card-header. Toont titels (uit auto-title), `message_count/20`, switch-flow met optimistic state-replace. Endpoint `GET /chat/conversations`. Optimaal voor de nieuwe 20-berichten-cap (kostenbescherming).
- [ ] **Streaming** — woord-voor-woord antwoorden (SSE)

### Dashboard algemeen
- [ ] **Command palette** (Cmd+K)
- [ ] **Notifications-bell** werkend
- [ ] **Keyboard shortcuts** overzicht
- [ ] **Export CSV/PDF** per pagina (gasten, reserveringen, rapportages)
- [x] ~~**Mobile responsive pass**~~ (2026-04-30) — alle 5 fasen afgerond. Sidebar wordt offcanvas onder 1024px (☰-burger in topbar), dash-body 1-kolom op tablet, KPI-row 5→2→1 cols, weather-row auto-fit (geen doormidden gesneden dagen meer), tabellen horizontaal scrollbaar binnen container, modals full-screen onder 768px, save-bar sticky bottom op mobile, publieke site (navbar/login/legal) ook mee. Breakpoints: 1024 / 768 / 480.
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
- [ ] `/apps/web/src/app/dashboard/account/page.tsx` — bevat nog "Komt beschikbaar zodra de Claude API gekoppeld is"-melding die nu niet meer klopt.
- [ ] Next.js warning `"middleware" file convention is deprecated; use "proxy" instead` — cosmetisch, te fixen door file te hernoemen naar `proxy.ts` bij een volgende pass.
- [x] ~~[kpi.service.ts](apps/api/src/kpi/kpi.service.ts) — `weekday_avg_pct = 68` hard-coded~~ (2026-04-30, zie Data Analyst-audit voor cascade-details).

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

## ⏭️ Eerstvolgende open taken (begin volgende chat hier)

Door Floris geselecteerd aan het einde van 2026-04-30 (na een
intensieve sessie waarin AVG, drankkaart-flow, on-demand
suggesties, lage-bezetting-detectie, tool-use migratie, demo-
account, en mobile-responsive over de hele app klaar zijn).

**State op dit moment**:
- Demo-account `floriskoevermans@outlook.com` met restaurant_id
  `a462cf39-ef9b-49cb-bd8e-a84a10a3f888` is gevuld met realistische
  data (18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews,
  5 campagnes incl. 2 afgeronde, 3 pending suggesties).
- Migraties t/m 0026 zijn gerund.
- App is volledig responsive (1024 / 768 / 480 breakpoints).
- Tool-use migratie compleet — geen JSON.parse-fouten meer mogelijk.

### Volgende sessie — kies één van deze drie

1. **🔴 P0: Mollie-billing flow** — eerste klant kan niet betalen
   zonder. 4 sub-taken: SDK installeren + checkout-flow op pricing-
   pagina, migratie `subscriptions`-tabel (plan/status/mollie_customer_id),
   plan-enforcement in backend (limieten op AI-calls/campagnes/teamleden
   per plan), Mollie webhook voor status-changes (trial → active →
   cancelled). **Vereist**: Mollie-account aanmaken (zakelijk).

2. **🟡 P1: Per-request Supabase-client met user-JWT** — fase A
   (audit-log compleet) is afgerond op 2026-04-30. Alle 6 service-
   domeinen schrijven naar `audit_log` met echte userId. **Fase B is
   nog open**: backend draait nog op `service_role` (RLS-bypass).
   Toe te voegen: `RequestSupabaseService` (Scope.REQUEST) die het
   user-JWT uit de Authorization-header pakt en als
   `global.headers.Authorization` doorgeeft aan een nieuwe Supabase-
   client per request. Daarna gefaseerde adoptie per service (start
   bij MenuService als pilot) zodat RLS daadwerkelijk getest wordt.
   `SupabaseService` (service_role) blijft voor admin-flows die
   bewust RLS bypassen (bv. ai_usage logging zonder restaurant_id).
   **Geen externe accounts nodig**.

3. **🟡 P1: Site-fundamenten (publieke site)** — voor zodra je
   iemand naar `get-filly.com` stuurt. Contact/waitlist-formulier
   met Resend, 404-pagina, sitemap.xml, robots.txt, og-images per
   pagina, About-pagina met Floris-verhaal, footer invullen.
   **Vereist**: Resend-account voor het contact-formulier (ook
   nodig voor Supabase Auth SMTP straks).

### Mijn aanbeveling

**Begin met #2** (audit-log + per-request Supabase). Geen externe
accounts, technisch beheersbaar in 1 sessie, raakt direct de
productie-readiness voor schaal. Mollie en site-fundamenten
hebben beide externe afhankelijkheden waar je eerst account-werk
voor moet doen.

### Andere vermeldenswaardige open punten

- **🔴 Test-account FK-cascade fix** (COO P0) — `auth.user` delete
  laat wees-restaurants achter. Of DB-trigger + cascade, of een
  reset-script. Niet acuut want we gebruiken nu het demo-account
  vanuit `floriskoevermans@outlook.com`.
- **🟡 Resend SMTP voor Supabase Auth** — lost de 3-4/uur rate-
  limit op. Email-confirmation kan dan weer aan in dev. Vereist
  Resend-account.
- **🟡 Geocoding-backfill-script** — bestaande restaurants zonder
  lat/long. Bij demo-account: gebruik `update restaurants set
  latitude=..., longitude=... where id='...'`-snippet als de
  WeatherForecast-card '—' toont.
- **🟢 Platform-specifieke output per social-media-post** (P2 in
  Filly AI-features) — Floris-verzoek 2026-04-30 om te bepalen
  welke output per kanaal optimaal is. Vereist tool-schema +
  prompt per campaign_type + nieuw social_platform-veld.

## Audit 2026-04-29 — Bevindingen per rol

Markers: 🔴 P0 kritiek · 🟡 P1 productie-hygiëne · 🟢 P2 verbetering.
Items in deze sectie staan los van de hoofd-prio's hierboven; bij oppakken
verplaatsen naar de juiste P-bucket.

### Data Analyst
- [x] ~~🔴 Mock-data van dashboard af~~ (2026-04-29) — `FILLY_MOCK` weggehaald uit kpi-row, alle "door Filly"-onderregels weg. Komen pas terug als reservations.via_campaign_id-FK gevuld wordt door de send-engine.
- [x] ~~🔴 `isFromFilly()` is een hash-mock~~ (2026-04-29) — gasten-pagina: hele "Via Filly"-kolom + stat-card weg. Reserveringen-pagina: nu gebaseerd op echte `source`-veld (alleen "filly"-source matcht), niet meer op hash.
- [x] ~~🔴 `reservations.via_campaign_id` FK ontbreekt~~ (2026-04-29 — migratie 0022) — ook `guests.acquired_via_campaign_id`. Reserveringen-pagina heeft nu een dropdown om handmatig te koppelen. KpiService berekent op basis van deze FK Filly-ROI; rapportages-pagina toont 6-maanden grafiek + per-campagne tabel.
- [x] ~~🔴 `FILLY_ROI_6M` + `FILLY_BY_TYPE` in rapportages~~ (2026-04-29) — hard-coded arrays + ROI-sectie weg, vervangen door eerlijke "Filly-ROI nog niet meetbaar"-empty-state. Komt terug zodra send-engine attributie heeft.
- [x] ~~🟡 **`weekday_avg_pct = 68` hard-coded**~~ (2026-04-30) — vervangen door 3-staps cascade in `computeWeekdayAvgPct`: (1) eigenaar-target (nieuwe `restaurants.target_weekday_occupancy_pct` via mig 0027) → (2) 6-maanden ma-vr aggregaat als ≥30 datapunten → (3) fallback 68. Eigenaar kan target zelf instellen op account-pagina (Capaciteit-sectie).
- [x] ~~🟡 **`audit_log`-tabel** — alle relevante writes live~~ (2026-04-30 fase A). `AuditLogService` integraties: `CampaignsService` (created/status_changed/deleted), `RestaurantService` (updated/website_analyzed), `ReservationsService` (attribution_set), `MenuService` (item_created/updated/deleted + card_imported/removed), `ReviewsService` (response_updated), `OnboardingService` (onboarding_completed). Alle service-signatures ontvangen nu een echte `userId` (controllers reiken `@CurrentUser` door). Bij menu-card-import kan userId null zijn (pre-onboarding-uploads).
- [ ] 🟡 **`ai_usage` tracking heeft geen dashboard** — Claude-kosten zijn alleen via DB-query zichtbaar. Mini-page voor admin om kosten per restaurant te zien.
- [ ] 🟢 **Geen Plausible/PostHog** op publieke site — onbekend waar bezoekers afhaken.

### Developer
- [x] ~~🔴 Storage-bucket `restaurant-assets` had `anon insert/update`-policies~~ (2026-04-29 — migratie 0021) — nu alleen `authenticated`-rol mag schrijven. Anon-read blijft (publieke logo-vertoning in mail-templates). Toekomst: per-restaurant path-prefix RLS.
- [ ] 🔴 **Backend draait op `service_role`** → RLS bypass'd. Tenant-isolatie is alleen via TS-guards. Per-request Supabase-client met user-JWT toevoegen voor defense-in-depth (hangt aan bestaande P1).
- [ ] 🟡 **Pre-onboarding rate-limit is in-memory Map** → overleeft geen multi-instance deploy. Naar Redis/Upstash.
- [ ] 🟡 **Geen tests behalve `app.controller.spec.ts`** — 8.500 regels backend, één spec. Minimaal smoke-tests op auth + tenant-isolatie + key endpoints.
- [x] ~~🟡 Geen GitHub Actions CI~~ (2026-04-29) — `.github/workflows/ci.yml` toegevoegd: typecheck (api + web) + build (shared + api + web) per PR + push naar main. pnpm cache + concurrency-cancel voor snelle runs.
- [ ] 🟡 **WebsiteAnalyzer + MenuImporter zijn synchroon** (5-15s blocking). Bij gelijktijdige uploads loopt Node-process vast. Job-queue (BullMQ + Redis) toevoegen.
- [~] 🟡 **TODO's in code** — kpi.service.ts (weekday-avg) staat nog open. kpi-row.tsx (FILLY_MOCK) en suggesties/page.tsx (getMockProposal) zijn beide opgeruimd 2026-04-29 / 2026-04-30.
- [ ] 🟢 **Inline styling overal** — `style={{...}}` in elke component. Refactor naar Tailwind / CSS-modules voor onderhoudbaarheid op schaal.
- [x] ~~🟢 **`RestaurantService.update` accepteert `Record<string, unknown>`**~~ (2026-04-30) — vervangen door `RestaurantUpdateSchema` (zod) in `restaurant-update.schema.ts`. Allowlist via inclusion-in-schema; default `.strip` (niet `.strict`) zodat bestaande frontend die hele form-object stuurt niet breekt. Wel hygiëne-log van gefilterde keys via `logger.debug`.
- [ ] 🟢 **`@RequireModule`-decorator** voor module-permissies ontbreekt (alleen frontend-filtering).

### CTO
- [~] 🔴 **20 migraties handmatig** — setup-guide in [docs/database-migrations.md](docs/database-migrations.md). **Jouw actie**: Supabase CLI installeren + `supabase migration repair` runnen om bestaande migraties als applied te markeren.
- [x] ~~🔴 Prompt-caching activeren~~ (2026-04-29) — `cache_control: ephemeral` actief in `AiService` op chat + campaign-refine + reviews-refine. ~90% korting op input-tokens bij recurring calls binnen 5 min cache-TTL.
- [~] 🔴 **Sentry / error-tracking** — setup-guide in [docs/sentry-setup.md](docs/sentry-setup.md). **Jouw actie**: account aanmaken + 2 projecten + DSN's invullen.
- [~] 🔴 **Cost-alerts Anthropic** — setup-guide in [docs/anthropic-cost-alerts.md](docs/anthropic-cost-alerts.md). **Jouw actie**: monthly spending limit + alerts in Anthropic Console + aparte API-keys per environment.
- [~] 🟡 **Staging-omgeving** — setup-guide in [docs/staging-setup.md](docs/staging-setup.md). **Jouw actie**: 2e Supabase-project + 2e Railway-instance + Vercel preview-branch.
- [ ] 🟡 **Geen feature-flag systeem** — bij 1000+ klanten kan een release niet veilig naar 5% eerst.
- [~] 🟡 **Multi-instance scaling roadmap** — gedocumenteerd in [docs/scaling-roadmap.md](docs/scaling-roadmap.md). Concrete actie pas nodig bij ~100+ klanten (Redis voor rate-limits, BullMQ voor zware AI-calls).
- [x] ~~🟢 Graceful degradation bij Claude-downtime~~ (2026-04-29) — `AiService` vangt nu Anthropic-errors specifiek af (connection / rate-limit / 5xx / auth) en gooit NL-vriendelijke `ServiceUnavailable` i.p.v. raw 500.
- [x] ~~🟢 DB-schema-documentatie~~ (2026-04-29) — [docs/database-schema.md](docs/database-schema.md) met overzicht van alle 25 tabellen + relaties + open punten.

### CEO
- [ ] 🔴 **Mollie-billing ontbreekt** — eerste klant kan niet betalen. 4 sub-taken: SDK + checkout, subscriptions-tabel, plan-enforcement, webhook.
- [~] 🔴 **Privacy-verklaring + AV** — dynamisch rendering live (2026-04-30) via `apps/web/src/config/company.ts`. Banner verdwijnt zodra `legalName + kvk` ingevuld zijn. **Jouw actie**: KvK-inschrijving + bedrijfsgegevens invullen in `config/company.ts` + jurist-review boeken.
- [x] ~~🔴 Cookie-banner ontbreekt~~ (2026-04-29) — `<CookieBanner />` in root-layout, accept/reject keuze in localStorage. Klaar voor wanneer Plausible/PostHog wordt aangezet (analytics-init achter consent-check).
- [ ] 🔴 **Geen "Start trial / Probeer gratis"-flow** vanaf pricing-pagina.
- [x] ~~🟡 Geen onboarding-checklist op dashboard~~ (2026-04-30) — `OnboardingChecklist` bovenaan dashboard-home toont 6 setup-stappen met progress-bar; verbergt zich zodra alles ✓.
- [ ] 🟡 **Geen referral / vriend-werft-vriend**-systeem.
- [ ] 🟡 **About-pagina is leeg / placeholder** — geen "wie bouwt dit"-verhaal voor vertrouwen.
- [ ] 🟡 **Geen contactformulier** op publieke site — leads zonder account hebben geen kanaal.
- [ ] 🟢 **Concurrent-positionering** (vs. Resengo/Zenchef) onduidelijk in marketing.

### COO
- [ ] 🔴 **Geen interne admin-tooling** — klant-support gebeurt via Supabase Studio. Onhoudbaar bij 50+ klanten.
- [ ] 🔴 **Test-account opruimen heeft FK-cascade-gotcha** — auth.user delete laat wees-restaurants achter.
- [ ] 🟡 **Geen klanten-dashboard** ("welke klanten hebben KvK ingevuld? wie heeft Filly nooit gebruikt?").
- [ ] 🟡 **Geen incident-response runbook** — wat doe je als Claude API down is, Supabase storage faalt?
- [x] ~~🟡 Geen klant-data-export~~ (2026-04-29) — `GET /restaurant/me/export` endpoint met blob-download via `downloadRestaurantExport`. Geeft alle business-data (restaurant, gasten, reserveringen, menu, campagnes, reviews, chat, audit-log) in één JSON-bestand. Knop op account-pagina sectie "Data & privacy".
- [ ] 🟡 **Logging is inconsistent** — soms `Logger`, soms `console.log/warn/error`. Geen log-aggregator.
- [ ] 🟡 **Geen rate-limit per user op AI** (alleen 100/uur/restaurant). Eén user kan binnen 1 uur €5-10 verbranden.
- [ ] 🟢 **Geen monitoring** Claude/Supabase uptime — storingen alleen via klant-mails.

### Designer
- [x] ~~🔴 Niet mobile responsive~~ (2026-04-30) — alle 5 fasen afgerond. Zie hoofdsectie "Dashboard algemeen → Mobile responsive pass".
- [x] ~~🟢 KPI-row breekt onder 1280px~~ (2026-04-30) — KPI-row 5→2→1 cols via responsive pass.
- [~] 🟡 **Inline styling overal — design-tokens-laag toegevoegd** (2026-04-30 fase 1+2+3) — `tokens.css` is nu single source-of-truth (kleuren, spacing, radii, shadows, typography). globals.css + dashboard.css duplicaten weg; oude korte aliases (`--ts`/`--bl`/`--blue`/`--r`) blijven werken via aliases. Spacing-pas op dashboard-home + account-formulieren naar 8px-grid. **Nog open**: incidenteel inline `style={{...}}` vervangen wanneer je toch in een file zit.
- [~] 🟡 **Iconen-set is volledig emoji** (2026-04-30) — Lucide-react geïnstalleerd; selectief gemigreerd voor functionele controls (chat-send, modal-close, photo-replace, topbar burger/bell/search). Brand-decoratieve emoji's (✨ Filly-sparkle, 📷, 📄, 🍷, ⚠️ + sidebar-iconen) blijven bewust staan.
- [ ] 🟡 **Geen focus-states / aria-labels** op veel knoppen → WCAG-toegankelijkheid onder de maat.
- [x] ~~🟡 **`filly-chat.tsx` is 635 regels**~~ (2026-04-30) — gesplitst zoals voorgesteld; orchestrator nu 331 regels, sub-components gemiddeld <100 regels.
- [ ] 🟢 **Geen dark-mode**, geen i18n-voorbereiding (alles hard-coded NL).
- [x] ~~🟢 **Inconsistente knop-stijlen — base-component toegevoegd**~~ (2026-04-30 fase 1+2A) — `<Button variant="primary|secondary|ghost|danger" size="sm|md">` in `components/ui/button.tsx` + `<ButtonLink>` voor Link-as-button. **35 dashboard-knoppen gemigreerd** in 12 files (dashboard/account/campagnes/menu/gasten/reserveringen + 3 modal-components). `.btn-primary-dash` / `.btn-secondary-dash` CSS-classes blijven bestaan voor de paar resterende plekken (legacy onbelangrijke knoppen).
- [~] 🟢 **Geen Storybook / design-systeem documentatie** (2026-04-30) — light-weight reference-pagina op `/dashboard/design-system` toont alle tokens + 8 base-components (Button/ButtonLink/Badge/Card/PageHeader/EmptyState/Tabs/Input+Textarea) met live demos. Echte Storybook later als de component-library groeit.

---

## Recent voltooid

### 2026-05-01 — Chat-history + 20-bericht cap + chat-memory (kostenbescherming)

**Probleem dat dit oplost**: lange chats stapelen input-tokens op (elke
nieuwe user-msg stuurt de hele history mee aan Claude). Tegelijk wil je
NIET dat Filly geleerde voorkeuren ("vermijd het woord 'gezellig'",
"geen €-prefix") vergeet als je een nieuwe chat begint.

**Architectuur**: hybrid summary-based memory (NIET vector DB — overkill
voor huidige schaal). Bij chat-cap (20 berichten) vat Haiku 4.5 de chat
samen + slaat op in `restaurant_chat_memory`. Volgende chats krijgen de
laatste 5 memories als blok in de system-prompt (cacheable in
prompt-cache).

**Migratie 0028**:
- `restaurant_chat_memory` tabel + RLS-policies (drop+create voor
  re-run-idempotency)
- Index op `chat_messages.conversation_id` voor de cap-count query
- Seed-cleanup: oude mock-conversaties van vóór 2026-01-01 weg
  (donderdag/38%-demo uit 0001-seed)

**Backend**:
- `ChatMemoryService` (nieuw) — `summarizeAndSave` (Haiku tool-use met
  `has_learning`-flag voor skip bij niet-leerzame chats) +
  `getRecentMemories` + `formatMemoryBlock`
- `ChatService.CONVERSATION_CAP = 20` constante
- `ChatService.sendMessage` — cap-check werpt 400 met NL-tekst zodra
  count + 2 ≥ cap; bij cap-bereikt fire-and-forget memory-summary
- `ChatService.listConversations` (max 50) + `getConversation` +
  `createConversation` voor de history-flow
- `ActiveChatState.messageCount` toegevoegd (UI-indicator)
- `buildSystemPrompt` injecteert `=== EERDER GELEERD ===`-blok met
  laatste 5 memories
- 3 nieuwe endpoints: `GET /chat/conversations`, `GET /chat/conversations/:id`,
  `POST /chat/conversations`

**Frontend**:
- `FillyChatHistoryMenu` (nieuw) — dropdown in chat-card-header met
  conversatie-lijst + "+ Nieuw gesprek" + active-marker
- `lib/api.ts` uitgebreid: `fetchChatConversations` + `fetchChatConversation`
  + `createChatConversation`. `sendChatMessage` parst nu de NL-error
  message uit response body voor cap-detection.
- `FillyChat` orchestrator: `messageCount`-state + `capReached`-derived
  + `switchConversation` + `startNewConversation` handlers
- Indicator "Bericht X / 20" in card-subtitle vanaf 10 berichten
  (oranje vanaf 15, rood-zone gevoel)
- Bij cap-bereikt: input verbergt, vervangen door brand-soft CTA-block
  met "Filly onthoudt wat 'ie heeft geleerd"-tekst + nieuw-gesprek-knop

**Cost analysis** voor memory-systeem:
- Haiku 4.5 summary call: ~€0.001 per chat-cap-event
- Actieve klant met 1-2 cap-events/dag = ~€0.06/maand aan memory-kosten
- Memory in system-prompt = +200-500 tokens, cacheable
- Veel goedkoper dan vector DB (geen embedding-kosten + geen retrieval-tuning)

**Wat NOG niet gedaan** (voor later):
- Expliciete UI op account-pagina ("Verboden woorden", "Style notes")
- Vector DB (pas relevant bij 100+ memories per klant)
- Streaming chat (P3 backlog)

### 2026-04-30 — Design-system: tokens + 8 base-components + sweep-migraties

Grote UI-investeringssessie verspreid over 8 commits. Doel: van
"inline styling overal + 3 button-patterns + 5 inline empty-state-
patterns" naar één design-tokens-laag + composable component-library.

**Foundation** (commit `2492c15`):
- ✅ `apps/web/src/app/tokens.css` als single source-of-truth voor
  kleuren, spacing (8px-grid: --space-1 t/m --space-8), radii,
  shadows, typography. Oude korte aliases (--ts/--bl/--blue/--r/etc)
  blijven werken.
- ✅ `globals.css` + `dashboard.css` :root-blokken weg (waren duplicaten).
  Brand-update is nu één file.
- ✅ Eerste 3 base-components: `<Button>` (4 variants × 2 sizes +
  loading-spinner + iconLeft/iconRight), `<Badge>` (6 variants +
  optionele dot), `<Card>` + sub-components.
- ✅ `/dashboard/design-system` reference-pagina met live demos.

**Sweep-migraties** (commits `f8be354`/`06ea968`/`c29fc2f`):
- ✅ 35 dashboard-knoppen `.btn-primary-dash` / `.btn-secondary-dash`
  → `<Button>` (12 files).
- ✅ Lucide-iconen voor functionele controls: chat-send (↑→Send),
  modal-close (✕→X), photo-replace (↻→RefreshCw). Topbar later mee.
- ✅ Spacing-pas naar tokens: dashboard-home + page-full + form-section/
  grid/field + alert-bar. KPI-row gap 14→16, card-padding 20→24.

**Alignment-fixes + 3 nieuwe components** (commit `5da5a85`):
- ✅ `<PageHeader>` — vervangt 9 inconsistente page-header-row patterns
  (sommige met page-header-row wrapper, anderen stacked). Alle
  dashboard-pagina's nu uniform.
- ✅ `<EmptyState>` — 10 inline empty-state-instances → 1 component.
  Variërende margin-overrides verdwenen; topGap-prop voor expliciete
  intentie.
- ✅ `<ButtonLink>` — Button-stijl op Next.js Link. 2 plekken
  gemigreerd (account menu-link + account-verwijderd home-link).

**Topbar Lucide + 2 nieuwe components** (commit `6964503`):
- ✅ Topbar burger ☰→Menu, 🔔→Bell, 🔍→Search. <div>→<button> voor
  semantiek + aria-labels.
- ✅ `<Tabs items active onChange>` met optionele count-badge.
  5 tab-migraties: campagnes / reviews / reserveringen /
  suggesties / taken.
- ✅ `<Input>` + `<Textarea>` met label/hint/error en a11y-koppeling
  (htmlFor + id auto). Component paste-klaar voor account-pagina.

**Chips + account-pagina input-migratie** (commit `6daef9e`):
- ✅ `<Chips items active onChange>` voor pill-stijl filter (campagnes
  type-filter mail/social/whatsapp).
- ✅ Account-pagina: 25 form-velden gemigreerd naar `<Input>` /
  `<Textarea>`. Hint-tekst zit nu in een prop, label krijgt
  automatische htmlFor + id.
- Bewust niet gemigreerd: selects (4), custom chip-pickers (talen,
  terras-zon), color-pickers, openingstijden-grid, sluitingsdata-
  chips, logo-upload, delete-modal-confirm — die hebben eigen UI.

**Eindstaat na deze sessie** (`apps/web/src/components/ui/`):
- button.tsx + button-link.tsx
- badge.tsx
- card.tsx
- page-header.tsx
- empty-state.tsx
- tabs.tsx
- chips.tsx
- input.tsx (Input + Textarea)
- ui.css (alle component-stijlen op één plek)

**Wat er voor de volgende UI-sessie open staat**:
- Select-component (4 plekken in account-pagina, drempelwaarde net niet)
- Sidebar CSS-tokenisering (lage impact)
- Alert-bar als Card-variant (lage prio)
- Echte Storybook (later wanneer component-library groeit)

### 2026-04-30 — Audit-log compleet (Fase A van P1-#2)

Alle service-mutaties die een eindgebruiker via het dashboard kan
triggeren schrijven nu naar `audit_log` mét echte `userId`. Drie
soorten werk:

**A1 — userId doorgereikt in 5 bestaande audit-calls** (waar voorheen
`userId: null` stond):
- ✅ `RestaurantService.update` — controller `@Patch('me')` reikt
  `@CurrentUser` door; service-signature heeft nu `userId: string`.
- ✅ `ReservationsService.setAttribution` — `@Patch(':id/attribution')`
  reikt user door zodat Filly-ROI-attributie traceerbaar is.
- ✅ `CampaignsService.create` / `updateStatus` / `remove` — alle 3
  controllers + de SuggestionsService.approve-flow geven userId mee.
  `campaigns.create(restaurantId, input, userId: string)` is nu
  strict (geen optionele null meer).
- ✅ `SuggestionsController.approve` reikt user door naar
  `SuggestionsService.approve(restaurantId, suggestionId, userId)` →
  `CampaignsService.create(...)` zodat ook chat-approve-flow audit
  heeft.

**A2 — audit-writes toegevoegd op 4 ontbrekende plekken**:
- ✅ `MenuService.create/update/remove` → `menu_item_created/updated/deleted`.
  Update logt alleen `fields_changed` (keys), delete pakt `name` mee
  voor support, create pakt `name + category + is_signature` mee.
- ✅ `MenuService.importCard` → `menu_card_imported` met
  `kind + file_name + items_imported + confidence`. Eén import kan
  50+ gerechten in één klap toevoegen.
- ✅ `MenuService.removeCard` → `menu_card_removed` met `items_deleted`
  zodat we cascade-impact kunnen herleiden.
- ✅ `ReviewsService.updateResponse` → `review_response_updated`. Logt
  `source + rating + response_length` (niet de tekst zelf — voorkomt
  klant-namen in audit-log; tekst zit nog in de DB-rij zelf).
- ✅ `OnboardingService.completeOnboarding` → `onboarding_completed`
  met `type + had_website + menu_items_imported + drink_items_imported`.
  Markeer-moment voor "klant-since"-metrics.

**Module-imports**: `MenuModule`, `ReviewsModule`, `OnboardingModule`
importeren nu `AuditLogModule` (was alleen Restaurant + Reservations +
Campaigns).

**Wat is NIET gedaan deze sessie**:
- Per-request Supabase-client met user-JWT (Fase B). Bewust uitgesteld
  omdat dat een echte test-pas met RLS-validatie nodig heeft —
  vergeten policy = klant uit eigen data gesloten. Volgt in eigen sessie.

### 2026-04-30 — AVG, drankkaart, on-demand suggesties, tool-use, mobile-responsive

Grote sessie met ~20 commits. Hoofdpunten:

**AVG & legal**:
- ✅ `apps/web/src/config/company.ts` als centrale plek voor Get-Filly's eigen bedrijfsgegevens; `<LegalField>`-component op `/privacy` en `/voorwaarden`. Banner + placeholders verdwijnen automatisch zodra `legalName + kvk` ingevuld.
- ✅ AVG art. 17 (right to be forgotten): `DELETE /restaurant/me/account` met "VERWIJDER"-bevestiging. UI op account-pagina sectie "Data & privacy". Cascade-delete van auth.users + alle owner-restaurants. Bewijs-rij in nieuwe `account_deletions`-tabel.
- ✅ Migratie 0023: `campaign_benchmarks` + `account_deletions`. Anonimisering bij `campaign.status → afgerond` schrijft GDPR Recital 26-conforme rij (cuisine + region=provincie + capacity-bucket + month + theme + result-metrics, géén body, géén FK). Filly's leerschat groeit zonder PII-lekken.

**Tool-use migratie (alle Filly-flows)**:
- ✅ `AiService.generateStructured<T>` + `generateStructuredFromFile<T>` als centrale wrappers met Anthropic tool-use. Vision-calls gebruiken streaming-API zodat 24k-cap niet de 10-min-pre-flight raakt.
- ✅ Gemigreerd: website-analyzer, menu-importer, campagne-refine (3 varianten + minItems=3 maxItems=3), suggestion-refine, reviews-refine, schedule-suggestion. Geen JSON.parse-fouten meer mogelijk.
- ✅ Diagnostic: `max_tokens bereikt`-warning in logs zodat we caps tijdig kunnen ophogen.

**Drankkaart-flow**:
- ✅ Migratie 0024 (`menu_items.subcategory`) + 0025 (`menu_uploads.kind`). Drank-tool-schema dwingt subcategory-enum af (wijn-rood/wit/rose/mousserend, bier, cocktail, sterke-drank, koffie-thee, fris). Cap 24k voor drank, 16k voor menu — drank heeft langere description (druif/regio/jaargang).
- ✅ UI: 2 aparte upload-knoppen (📄 Menu / 🍷 Drank), 2 banners onder elkaar, klik op bestandsnaam opent signed URL.
- ✅ Onboarding-wizard heeft 2e file-input naast menu.
- ✅ `RestaurantContextService.buildMenuBlock` heeft nu aparte `MENU` en `DRANKKAART` secties zodat Filly wijnen niet door gerechten haalt.

**Suggesties-flow productie-waardig**:
- ✅ `getMockProposal()` weg. `SuggestionsService.getProposalDetails()` levert mainDish/sides/timing/bundle-prijs/heroImage via Claude tool-use, gecachet in `suggested_campaign.proposal_details`.
- ✅ "✨ Vraag Filly om voorstellen"-knop op /campagnes. `generateOnDemand()` → 3-5 suggesties met trigger_type-enum.
- ✅ Lage-bezetting-detect-and-generate: alert-bar bovenaan dashboard heeft actieknop. Window 2-14 dagen, drempel <50%, per-dag Claude-call met dag-context (weekdag, weer, segment-counts). Skip-regel: dagen met al pending suggestie worden overgeslagen.

**Variant-flow + schedule-cyclen**:
- ✅ Migratie 0026: `campaigns.variant_applied_at` + `scheduling_history`. Refine-sectie verbergt na variant-keuze; chat-varianten worden seed voor `filly_variants` (geen dubbele 3+3 generatie). Schedule-suggestie-knop cyclet door history na 4 unieke alternatieven (geen Claude-calls bij cycle).
- ✅ "📅 Inplannen" + "▶ Plaats nu / Activeer"-knoppen op detail-pagina header.

**Demo-account opgezet**:
- ✅ Radical-reset SQL voor schoon DB. Demo-account `floriskoevermans@outlook.com` (restaurant_id `a462cf39-ef9b-49cb-bd8e-a84a10a3f888`) gevuld met 18 gasten, 30 reserveringen, 31 occupancy-dagen, 10 reviews (mix Google/TripAdvisor/IENS), 5 campagnes (1 concept, 1 ingepland, 1 actief, 2 afgerond), 3 pending AI-suggesties met realistische triggers + 6 reservations gekoppeld aan afgeronde campagnes voor Filly-ROI.

**Onboarding-checklist**:
- ✅ `OnboardingChecklist`-component op account-pagina (NIET dashboard, want daar duwde 'ie KPI's weg). 6 items + progress-bar + ✕-dismiss (localStorage).

**Mobile-responsive (volledig)**:
- ✅ Fase 1: sidebar wordt offcanvas onder 1024px (☰-burger in topbar, backdrop, klik-buiten-sluit).
- ✅ Fase 2: dashboard-pagina — KPI-row 5→2→1 cols, weather auto-fit, dash-body 1-kolom op tablet.
- ✅ Fase 3: lijst-paginas — tabellen horizontaal scrollbaar, filter-tabs zijwaarts scrollen.
- ✅ Fase 4: detail-paginas + modals — form-grid 2→1 col, save-bar sticky bottom, modals full-screen onder 768px.
- ✅ Fase 5: publieke site — navbar/login/legal-tables responsive.
- ✅ Breakpoints: 1024 (tablet), 768 (telefoon), 480 (klein).

**KPI's & UX-tweaks**:
- ✅ KPI-row "via Filly"-regel altijd zichtbaar (ook bij 0).
- ✅ Menu-categorieën: 6e tab "Tussengerechten" toegevoegd, normalize-mapper voor ~20 alias-strings (zodat Vision niet kan ontsnappen aan de 6 UI-keys).
- ✅ WeatherForecast: nette empty-state ipv 7 lege dag-vakjes.

### 2026-04-29 — Gasten-attributie + Audit-log + Data-export (AVG)
- ✅ **Gasten Filly-attributie**: backend selecteert `acquired_via_campaign_id`, `setReservationAttribution` zet automatisch dezelfde campagne op de gast als nog niet gevuld. Frontend toont "Via Filly"-stat-card + kolom met badge. Cijfer matcht het écht-aantal (geen mock).
- ✅ **`AuditLogService`** (common/audit-log.service.ts + module): centrale schrijver voor de audit_log-tabel. Fail-soft: caller-actie blijft slagen ook als log mislukt.
- ✅ Audit-writes geïntegreerd: `CampaignsService` (created/status_changed/deleted), `RestaurantService` (updated met fields_changed-keys + website_analyzed), `ReservationsService` (attribution_set). userId=null voor nu — controllers reiken nog niet door.
- ✅ **`DataExportService` + `GET /restaurant/me/export`**: AVG art. 20 — eigenaar download alle business-data als één JSON-blob (alle directe + indirecte tabellen op restaurant-id). Knop op account-pagina.
- ✅ Privacy-eigenschap van payload-velden: `restaurant_updated` logt alleen de keys die wijzigden, geen waardes — voorkomt dat namen/emails/KvK in de audit-log belanden.

### 2026-04-29 — Echte Filly-attributie + GitHub Actions CI
- ✅ **Migratie 0022**: `reservations.via_campaign_id` + `guests.acquired_via_campaign_id` FKs (on delete set null) + indexes voor KPI-aggregaties.
- ✅ **Backend KpiService** uitgebreid: `getKpis` levert nu `month_filly_reservations / guests / share_pct / revenue_cents`. Twee nieuwe endpoints: `/kpi/filly-attribution` (per-campagne aggregaties) + `/kpi/filly-roi-6m` (6-maanden bucket-grafiek).
- ✅ **Backend `setReservationAttribution`** + `PATCH /reservations/:id/attribution`: handmatig koppelen aan campagne met tenant-isolatie + campagne-bestaan-check.
- ✅ **Reserveringen-pagina** heeft nu de `FillyAttributionControl`-component: dropdown waarmee eigenaar reservering aan campagne koppelt; gekoppeld toont groene badge met campagnenaam + "×"-knop. Optimistisch updaten met rollback bij fout.
- ✅ **Dashboard KpiRow** toont nu "+N gasten via Filly" + "X% via Filly" + "+€Y via Filly" — gebaseerd op échte FK-data, niet op mock.
- ✅ **Rapportages-pagina** Filly-ROI-sectie weer actief: 3 totaalcijfers + 6-maanden bar-grafiek + per-campagne tabel. Toont eerlijke empty-state als nog geen koppelingen.
- ✅ **GitHub Actions CI** (`.github/workflows/ci.yml`): typecheck + build per PR. pnpm-cache + concurrency-cancel.

### 2026-04-29 — Mock-data eruit + Storage-policies + Cookie-banner
- ✅ **`FILLY_MOCK` uit kpi-row** verwijderd. Geen "+2 reserveringen door Filly"-fake meer op het dashboard. Cards tonen alleen de echte cijfers tot de send-engine attributie levert.
- ✅ **`isFromFilly()` weggehaald** in gasten (kolom + stat-card weg), in reserveringen vervangen door check op echt `source`-veld. Geen hash-mock meer.
- ✅ **`FILLY_ROI_6M` + `FILLY_BY_TYPE` uit rapportages** verwijderd. Hele Filly-ROI-sectie vervangen door eerlijke "nog niet meetbaar — wacht op send-engine"-empty-state.
- ✅ **Migratie 0021**: storage-bucket `restaurant-assets` policies aangescherpt — `anon insert/update/delete` weg, alleen `authenticated`-rol mag nog schrijven. Lek dichtgezet.
- ✅ **Cookie-banner** (`apps/web/src/components/cookie-banner.tsx`) in root-layout. Eerste bezoek → keuze accepteer/weiger, opgeslagen in localStorage. Klaar voor analytics-integratie.

### 2026-04-29 — CTO-taken: prompt-caching + graceful degradation + setup-docs
- ✅ **Prompt-caching live** — `AiService.generateText` accepteert nu `cacheSystem: true`. Wordt gebruikt door chat (elke bericht), campaign-refine (regenerate), reviews-refine (regenerate). Anthropic prompt-caching geeft ~90% korting op input-tokens bij recurring calls binnen 5 min TTL. `ai_usage` logt nu ook `cache_creation_input_tokens` correct.
- ✅ **Graceful Claude-downtime** — nieuwe `toNlException`-helper in `AiService` vangt `APIConnectionError` / `RateLimitError` / `AuthenticationError` / 5xx / 4xx specifiek af en gooit een NL-vriendelijke `ServiceUnavailable` ("Filly is even druk", "Filly is niet bereikbaar") i.p.v. raw 500.
- ✅ **DB-schema-documentatie**: [docs/database-schema.md](docs/database-schema.md) met alle tabellen + relaties + storage-buckets + migratie-overzicht + open DB-punten.
- ✅ **Setup-guides geschreven** voor de CTO-taken die externe accounts vereisen:
  - [docs/database-migrations.md](docs/database-migrations.md) — Supabase CLI workflow
  - [docs/sentry-setup.md](docs/sentry-setup.md) — error-tracking setup
  - [docs/anthropic-cost-alerts.md](docs/anthropic-cost-alerts.md) — cost-control + budget-alerts
  - [docs/staging-setup.md](docs/staging-setup.md) — 2e Supabase + Railway + Vercel preview
  - [docs/scaling-roadmap.md](docs/scaling-roadmap.md) — multi-instance scaling per groei-fase

### 2026-04-29 — Empty-states-sweep afgerond
- ✅ KpiRow: rode "Fout bij laden KPI's" → "Cijfers nog niet beschikbaar — zodra reserveringen en campagnes binnenkomen verschijnen ze hier."
- ✅ WeatherForecast: rode "Fout: …" → "Nog niet beschikbaar — vul je adres aan op de account-pagina."
- ✅ Suggesties-pagina: rode "Fout: {error}" → empty-state-card met info over herladen.
- ✅ Campagne-detail-pagina: rode tekst bij niet-bestaande campagne → mooie empty-state met "Campagne niet gevonden"-uitleg.
- ✅ Account-pagina: rode "Fout bij laden:" → empty-state met "Account-gegevens niet geladen — probeer herladen of opnieuw inloggen."
- ✅ Rapportages-pagina: nieuwe klant zonder data zag overal "0%" → volledige empty-state ("Nog geen data om te rapporteren"), pas zichtbaar als alle 3 datasets (guests/campaigns/occupancy) leeg zijn.
- ✅ Reviews-pagina: nieuwe klant zonder reviews → empty-state die naar koppelingen-pagina verwijst voor Google Business / TripAdvisor-import.
- ✅ Form-validation-fouten (reservering aanmaken, review-reply genereren) blijven bewust rood — passend bij user-action-fouten (≠ page-load).

### 2026-04-29 — Account-pagina volledig werkend (alle profiel-velden bewerkbaar)
- ✅ Migratie 0018: 7 nieuwe kolommen op `restaurants` voor bedrijfsgegevens (legal_name, kvk_number, vat_number, contact_email, contact_phone) + e-mailinstellingen (email_from_name, email_reply_to).
- ✅ Backend `RestaurantService.update`: forbidden-field filter (id/created_at/plan/lat-long), validatie (KvK 8-cijfers, BTW NL-format, e-mail regex, telefoon min 8 cijfers), automatische geocoding-trigger via PDOK bij adres-wijziging. Forbidden lat/long → reset bij geen geocode-match.
- ✅ Backend `RestaurantService.analyzeWebsite` + endpoint `POST /restaurant/me/analyze-website`: handmatige Claude-call die tagline/sfeer/USPs/socials/etc invult (alleen non-empty velden zodat bestaande data niet stuk gaat).
- ✅ Frontend Restaurant-type uitgebreid: 7 bedrijfs-velden + logo_url + brand_colors.
- ✅ Account-pagina herschreven: 14 secties — Restaurant / Identiteit / Website (analyze-knop nu actief) / Locatie / **Openingstijden** (NIEUW: per-dag editor met Open-toggle + tijden) / **Sluitingsdata** (NIEUW: chip-list, add via date-picker) / Capaciteit / **Talen** (NIEUW: chips multi-select) / Branding (logo upload via restaurant-assets bucket + brand_colors color-pickers + brand_tone) / **Social media** (Instagram + Facebook + TikTok + LinkedIn) / **Bedrijfsgegevens** (NIEUW: legal_name, KvK, BTW, contact-email, contact-telefoon) / **E-mailinstellingen** (NIEUW: afzender-naam + reply-to) / Menukaart (vervangen door link naar /dashboard/menu) / Abonnement.
- ✅ Globale save-bar werkt voor alle secties tegelijk; Filly krijgt nieuwe/aangepaste velden direct bij volgende prompt-call.

### 2026-04-29 — Rijke context naar campagne-refine + schedule + reviews-reply
- ✅ **CampaignsService.refine** (3 alternatieven genereren): system-prompt krijgt nu `buildProfileBlock` + `buildMenuBlock`. Filly kan in varianten verwijzen naar échte gerechten met prijzen, USPs, doelgroep en sfeer i.p.v. generieke marketingtaal. Anti-hallucinatie regel: "refereer ALLEEN aan menu-items die letterlijk in MENU staan".
- ✅ **CampaignsService.suggestSchedule** (tijdstip-voorstel): losse `restaurants`-query weg, vervangen door `buildProfileBlock` + `buildLiveBlock`. Filly houdt nu rekening met openingstijden, special events, en actuele bezetting bij het kiezen van een verzendmoment.
- ✅ **ReviewsService.generateReplySuggestion + refineVariants**: zelfde `buildProfileBlock` integratie. `buildReviewReplySystemPrompt` accepteert nu een profile-string i.p.v. los object. Filly kan in z'n review-antwoord refereren aan signature dishes, sfeer of USPs als de review er over gaat.
- ✅ Geen DB-wijzigingen nodig — alle data zat al in `restaurants` + `menu_items`.

### 2026-04-29 — Menukaart-upload werkt echt + Filly kent recent toegevoegde items
- ✅ **A — Recent-toegevoegd-sectie in MENU-blok**: `buildMenuBlock` neemt nu `created_at` mee, voegt onderaan een lijst toe met de 8 nieuwste items (laatste 30 dagen) gesorteerd op datum. Filly kan zo letterlijk antwoorden op "wat is jullie nieuwste signature?".
- ✅ **B — Menukaart-upload écht werkend**: `MenuService.importCard` uploadt naar `menu-uploads` bucket, maakt `menu_uploads`-rij, draait `MenuImporterService` (Claude Vision) en schrijft alle gerechten weg als `menu_items` met `menu_upload_id` FK. Bij Vision/insert-fouten: `processing_error` op upload-rij + bestand blijft staan voor audit.
- ✅ Backend endpoints: `POST /api/menu/import-card` (multipart), `GET /api/menu/active-card`, `DELETE /api/menu/cards/:uploadId`. Eerste in MenuModule waar AiModule wordt geïmporteerd.
- ✅ Frontend: `importMenuCard` / `fetchActiveMenuCard` / `deleteMenuCard` in `lib/api.ts`. Menu-pagina haalt actieve kaart bij mount op zodat banner ook na F5 zichtbaar is.
- ✅ `UploadMenuModal` rewrite: echte file-upload via FormData + 3 cosmetische stages tijdens 5-15s wachttijd ("Uploaden → Filly leest → Toevoegen"). Bij success: lijst met geïmporteerde items + Filly's notes. Bij fout: error-stage met message. Modal-sluiten geblokkeerd tijdens upload.
- ✅ "Verwijder menu-kaart"-knop doet echte API-call (cascade-delete: items met `menu_upload_id` verdwijnen, handmatige items blijven). State-banner refresh't via `fetchActiveMenuCard`.

### 2026-04-29 — Menu-pagina écht aangesloten op DB
- ✅ Backend `MenuService.create / update / remove` met validatie (NL-foutmeldingen op naam-leeg, prijs-negatief, ongeldig seizoen, te veel dieet-tags). Tenant-isolatie via dubbel `eq(restaurant_id)` bovenop de RestaurantAccessGuard.
- ✅ Endpoints `POST /api/menu`, `PATCH /api/menu/:id`, `DELETE /api/menu/:id`.
- ✅ Frontend `lib/api.ts`: `createMenuItem` / `updateMenuItem` / `deleteMenuItem` met `readErrorMessage`-helper voor nette NL-fouten in alerts.
- ✅ Menu-pagina `saveItem` / `deleteItem` zijn async, doen API-call + verse `fetchMenu`-refetch zodat lokale state altijd matcht met DB. `saving`-state disablet modal-knoppen tijdens roundtrip + toont "Toevoegen…/Opslaan…/Verwijderen…".
- ✅ **Resultaat**: nieuwe gerechten en wijzigingen verschijnen direct in Filly's volgende prompt (`buildMenuBlock` leest live uit dezelfde `menu_items`-tabel).

### 2026-04-29 — Filly weet nu profiel + menu (rijke context in chat)
- ✅ `RestaurantContextService` opgesplitst in 3 builders:
  - `buildProfileBlock()` — type/cuisine, tagline, sfeer, doelgroep, USPs, signature dishes, locatie, prijsklasse, capaciteit, faciliteiten, openingstijden (compacte formattering met dag-groepering), talen, socials, website, brand_tone.
  - `buildMenuBlock()` — gerechten gegroepeerd per categorie, naam + €-prijs + [signature]-marker, top 60 items, dieet-overzicht onderaan (8× vegan, 12× vegetarian, etc).
  - `buildLiveBlock()` — voorheen `buildContextBlock`: weer/bezetting/reserveringen.
- ✅ `buildFullContext()` plakt alle 3 blokken samen voor features die volledige context nodig hebben (chat, suggesties, refine).
- ✅ `buildContextBlock` blijft als alias voor backwards-compat (geeft alleen live-block).
- ✅ Chat `buildSystemPrompt` gebruikt nu `buildFullContext` + extra anti-hallucinatie regels ("refereer alleen aan menu-items die letterlijk in MENU staan").
- ✅ Helpers: `formatOpeningHours` (groepeert aaneengesloten dagen: "ma-vr 11:00-23:00 · za-zo 10:00-23:00"), `formatPrice` (NL-locale €-format), `shorten` (knipt op spatie).

Open: prompt-caching activeren op profiel+menu (P2 in BACKLOG). Campagne-services (`refine`, `suggestSchedule`) en reviews-reply nog naar dezelfde context laten luisteren.

### 2026-04-29 — Campagne-actieknoppen vereenvoudigd (lineaire flow)
- ✅ Migratie 0017: bestaande `gearchiveerd`-rijen → `afgerond` + CHECK-constraint vernauwd tot 4 statussen (`concept`, `ingepland`, `actief`, `afgerond`).
- ✅ `CampaignStatus`-type opgeschoond, badge-stijl `.gearchiveerd` uit dashboard.css.
- ✅ Lineaire status-flow zonder zijpaden:
  - `concept` → ✓ Inplannen + ✕ Verwijder
  - `ingepland` → ▶ Activeer + ✕ Verwijder
  - `actief` → ⏹ Stop (= afgerond)
  - `afgerond` → eindstaat, geen actie-knop
- ✅ Backend `updateStatus`-allowed-map: alleen voorwaartse transities (geen "↶ Concept", geen "Opnieuw inplannen").
- ✅ Backend `remove`: toegestaan voor concept én ingepland (nog niet uitgegaan, geen audit-impact). Actief/afgerond blijven onaantastbaar in DB.

### 2026-04-25 — WhatsApp-foto in eigen card + Filly-tijdstipsuggestie
- ✅ WhatsApp-detail-layout: foto-slot uit de bubbel-preview verplaatst naar een eigen "Foto"-card direct onder Inhoud. Social-layout blijft ongewijzigd (foto in Instagram-preview is visueel correct daar).
- ✅ Migratie 0016: `campaigns.suggested_scheduled_for` + `suggested_scheduled_reasoning` voor Filly's caching van tijd-voorstel.
- ✅ Backend: `suggestSchedule(restaurantId, id, force?)` — Claude-call met type/restaurant-context, returnt datetime + reasoning. Cachet in DB; force=true overschrijft. `setSchedule(restaurantId, id, datetime)` — handmatige set met validatie. `findById` levert nu beide velden mee.
- ✅ Endpoints: `POST /:id/suggest-schedule` + `PATCH /:id/scheduled`.
- ✅ Frontend `CampaignSchedulePanel`: auto-bootstrap bij eerste open van concept zonder voorstel; toont "Filly stelt voor: [datetime]" met reasoning + "Accepteer / Wijzig zelf / Andere suggestie"-knoppen. Bij scheduled_for gezet: definitieve tijd + Wijzig-knop. Native datetime-local input voor handmatige override.

Open: AI-foto genereren via fal.ai/Replicate/OpenAI (provider-keuze ligt bij Floris).

### 2026-04-25 — Foto-upload op concept-campagnes (social + whatsapp)
- ✅ Migratie 0015: `campaign-media` Storage-bucket (private) met RLS-policies — zelfde patroon als menu-uploads, eerste path-segment is restaurant_id voor tenant-check via `user_has_restaurant_access`.
- ✅ CampaignsService: `uploadMedia` (validate + upload + cleanup oude file + save path), `deleteMedia` (storage rmdir + clear DB-veld), `signMediaPath` (1-uur signed URL). `findById` levert nu signed URLs voor preview i.p.v. ruwe paden.
- ✅ Backend endpoints: `POST /api/campaigns/:id/media` (multipart, 10MB cap, JPG/PNG/WebP/GIF) + `DELETE /api/campaigns/:id/media`. Beide alleen op concept-status; mail-type weigert (header-image is later werk).
- ✅ Nieuwe `CampaignMediaSlot`-component: drop-zone bij geen foto, `<img>`-preview bij wel foto met overlay-knoppen "↻ Vervang" / "✕". Drag-and-drop ondersteund. Geïntegreerd in social-preview én whatsapp-preview.
- ✅ Path-conventie `<restaurant_id>/<campaign_id>/<timestamp>-<safeName>` zodat we per campagne kunnen wissen + filenames sanitizen tegen path-traversal.

Open: AI-foto genereren via fal.ai/Replicate/OpenAI (provider-keuze ligt bij Floris).

### 2026-04-25 — Filly-varianten-cache + 1× regenerate (campagnes + reviews)
- ✅ Migratie 0014: `campaigns.filly_variants jsonb` + `filly_variants_regen_count int` (idem voor reviews). Cachet 3-of-6 alternatieven server-side zodat her-bezoek geen Claude-calls triggert.
- ✅ CampaignsService: `getVariants` (read cache) + `refine` met count-logic (count=0→3, count=1→3 extra, count≥2→BadRequest). PATCH /campaigns/:id wist cache + reset count bij body-wijziging zodat alternatieven matchen met de nieuwe inhoud.
- ✅ ReviewsService: zelfde patroon — `getVariants` + `refineVariants` met 3-tegelijk JSON-prompt.
- ✅ CampaignRefinePanel rewrite: bootstrap fetcht cache, auto-genereert 3 als leeg. "Genereer 3 nieuwe"-knop bij `can_regenerate`. Daarna disabled met copy "Maximum bereikt".
- ✅ Reviews-modal: variants-grid altijd zichtbaar (auto-fit minmax 180px). Knop "↻ Genereer 3 nieuwe" verschijnt bij can_regenerate; verdwijnt bij count=2.

### 2026-04-25 — Quick-actions + TasksStrip-filter + 3-varianten-flow
- ✅ **Quick-actions in campagnes-tabel**: nieuwe kolom "Actie" rechts naast Status. Per status andere knoppen: concept → Inplannen / Verwijderen, ingepland → Activeren / Concept / Archiveer, actief → Stop, afgerond → Archiveer, gearchiveerd → Verwijderen. `PATCH /api/campaigns/:id/status` met allowed-transitions-map; `DELETE /api/campaigns/:id` alleen op concept of gearchiveerd (audit-veiligheid).
- ✅ **TasksStrip filter + scroll**: tabs "Actie vereist (N)" / "Alle (N)" — eerste filtert op high+medium prio. Lijst krijgt `max-height: 320px` met scroll zodat lange takenlijsten de pagina niet uitrekken.
- ✅ **3 varianten per chat-proposal**: prompt updated zodat Filly altijd 3 alternatieven naast elkaar genereert (warm/zakelijk/speels). Parser ondersteunt zowel variants[] als legacy single-body. SuggestionDetailModal rendert klikbare grid; selectie via `POST /api/suggestions/:id/select-variant`. Refine herschrijft alleen geselecteerde variant. Approve maakt campagne uit geselecteerde variant.

### 2026-04-24 — Concept-campagne bewerken + chat-refine op suggesties + empty-state-sweep
- ✅ `PATCH /api/campaigns/:id` — updaten van concept-campagnes (name, subject_line, body). Backend weigert als status ≠ concept zodat verzonden/ingeplande campagnes immutable blijven.
- ✅ Frontend: "✎ Bewerken"-knop op concept-campagne-detail → inline edit-form voor naam + onderwerp + inhoud. "Opslaan"/"Annuleren". Refetch na save zodat previews meteen kloppen.
- ✅ `POST /api/suggestions/:id/refine` — Filly past suggestie aan op basis van een instructie ("maak huiselijker", "korter", "andere foto"). Claude krijgt huidige campagne + instructie → returns nieuwe volledige versie → update `ai_suggestions.suggested_campaign`. Blijft pending.
- ✅ `SuggestionDetailModal` op /campagnes: 2-kolommenview (inhoud + side-chat). Vanaf "Details"-knop op elk suggestie-kaartje. Praat-met-Filly-chat + Goedkeuren/Afwijzen-acties onderaan.
- ✅ Empty-state-sweep: rode "Fout: HTTP 403/500"-banners vervangen door rustige empty-states met "niet geladen"-copy bij fout. Gasten, menu, reserveringen, campagnes zijn nu helder en eenduidig.

### 2026-04-24 — Reserveringen: handmatige invoer + filter + zoek
- ✅ Backend: `ReservationsService.create()` + `POST /api/reservations` voor handmatige boekingen. Required: naam, datum, tijd, groep. Optioneel: telefoon, mail, bijzonderheden, notes. Auto-status='bevestigd', source='handmatig'.
- ✅ Frontend: "＋ Nieuwe reservering"-knop rechtsboven (page-header-row), opent modal met form (Escape/klik-buiten = dicht).
- ✅ Filter-tabs: Alle / Bevestigd / Ingecheckt / Voltooid / No-show / Geannuleerd.
- ✅ Zoekveld: matcht op naam, telefoon, mail — realistische usecase voor telefoon-gesprek ("familie Jansen" of laatste paar cijfers van een nummer).
- ✅ Via Filly-badge: groene "✓ Via Filly"-pill in aparte kolom consistent met gasten-pagina. Pill naast naam weggehaald om dubbele info te voorkomen.
- ✅ Empty-state onderscheidt "niks gevonden met filters" van "nog helemaal geen reserveringen" (met "Nieuwe reservering"-CTA).

### 2026-04-24 — Gasten: Via Filly als eerste kolom
- ✅ Nieuwe eerste kolom (90px breed) met groene "✓ Ja"-badge of streepje.
- ✅ Pill naast naam weggehaald om dubbele info te voorkomen.

### 2026-04-24 — Campagnes + suggesties samengevoegd onder /campagnes
- ✅ Structurele refactor: Filly's voorstellen (auto-gegenereerd + uit chat) en campagnes leven samen op `/dashboard/campagnes`. Suggesties-strip bovenaan, campagne-tabel daaronder. Geen dubbelop-gevoel meer.
- ✅ Backend: `SuggestionsService.approve()` maakt campagne aan uit `suggested_campaign` JSON + zet `ai_suggestions.status='approved'` + `approved_campaign_id` FK. Wordt aangeroepen via nieuwe `POST /api/suggestions/:id/approve`.
- ✅ Backend: `SuggestionsService.createFromChat()` + ChatService maakt nu een ai_suggestion bij elk chat-voorstel (`trigger_type='chat'`), koppelt aan `chat_messages.ai_suggestion_id`, vult `message_card.suggestion_id`. Chat-voorstellen lopen daardoor door dezelfde goedkeur-flow als auto-gegenereerde suggesties.
- ✅ Frontend: `/campagnes` pagina fetcht beide + rendert suggesties-strip met `SuggestionCard`-componenten (inline styling: bron-label, type-badge, urgentie, body-preview, 3 acties). Goedkeuren → direct naar nieuwe campagne.
- ✅ Sidebar: "Suggesties" verwijderd als apart menu-item (route `/dashboard/suggesties` blijft voorlopig bestaan voor detail-views totdat blok 3 de chat-edit-modal levert).
- ✅ Module-imports bijgewerkt: CampaignsModule exporteert CampaignsService, SuggestionsModule importeert CampaignsModule + exporteert zichzelf, ChatModule importeert SuggestionsModule.

### 2026-04-24 — Filly-chat → campagne-actie
- ✅ System-prompt uitgebreid met `<<FILLY_PROPOSE_CAMPAIGN>>` formaat zodat Filly zelf aangeeft wanneer hij een concrete campagne voorstelt (alleen bij actionable, niet bij brainstorm)
- ✅ `extractCampaignProposal()` parser: strip het machine-blok uit de prozatekst en valideer JSON (type/name/body). User ziet alleen nette tekst, message_card bevat de proposal.
- ✅ `chat_messages.message_card` (bestond al sinds migratie 0001) wordt nu daadwerkelijk gevuld — geen nieuwe migratie nodig
- ✅ `CampaignsService.create()` + `POST /api/campaigns` — insert in campaigns + type-specifieke content-tabel, rollback bij content-fout
- ✅ Frontend `ProposalCard`-component onder Filly-bericht: type-badge + titel + onderwerp + "Ja, maak aan / Nee, bedankt". Na accept → link naar `/dashboard/campagnes/[id]`. Per-message status-state (pending/creating/created/dismissed/error).
- ✅ Nieuwe campagnes landen met status `concept` en `meta: "Voorgesteld door Filly"` zodat ze herkenbaar zijn in overzicht.

### 2026-04-24 — Menu-items-insert bug fix
- ✅ **Root-cause**: `menu_items.insert()` probeerde te schrijven naar kolom `allergens` die niet bestond (schema had alleen `dietary_tags`). Alle Vision-extracties faalden silent door `console.warn` zonder rollback, terwijl onboarding-response 'succesvol' teruggaf.
- ✅ Migratie 0013: `menu_items.allergens text[]` toegevoegd (EU 1169/2011 allergeen-info, semantisch gescheiden van dietary_tags)
- ✅ OnboardingService: `console.warn` → `console.error` + `menuImport: { attempted, inserted, error }` in response zodat frontend de fout kan tonen
- ✅ Onboarding-frontend: `alert()` bij `menuImport.error` zodat user niet stil menu-items verliest
- ✅ Geverifieerd: nieuw test-account kreeg 54 menu-items correct geïmporteerd

### 2026-04-24 — Auth + onboarding
- ✅ Password-reset flow: `/forgot-password` + `/reset-password` + Supabase email-template (commit `335f5a1`)
- ✅ Supabase Management API-script `pnpm supabase:apply-templates` voor alle 4 email-templates (commit `2775f08`)
- ✅ `<PasswordStrength>`-component met live 4-checks (8+, letter, cijfer, speciaal) + confirm-veld op signup én reset-password (commit `15fe843`)
- ✅ `/onboarding` 3-stappen wizard + POST `/api/onboarding/restaurant` + dashboard-redirect-middleware (commit `5d888c9`)
- ✅ Migratie 0010: `restaurants.website_url` + `onboarded_at`
- ✅ `WebsiteAnalyzerService` — cheerio-crawl + Claude-analyse, vult alle profiel-velden (tagline, atmosphere, target_audience, USPs, signature_dishes, cuisine_style, website_summary, social_media) (commit `b29f317`)
- ✅ `MenuImporterService` — Claude Opus 4.7 Vision op PDF/image, extraheert gerechten + prijzen + categorieën + allergenen (commit `b29f317`)
- ✅ `AiService.generateFromFile` — Vision- en document-support
- ✅ Migratie 0011: `menu_uploads`-tabel + `menu-uploads` Storage-bucket met RLS
- ✅ Migratie 0012: `ai_usage.restaurant_id` nullable voor pre-onboarding logging
- ✅ FillyChat wacht op RestaurantContext → eliminatie 400-race bij eerste dashboard-render (commit `b29f317`)
- ✅ Polish-fixes: fetch-timeout 5s → 12s (Cloudflare/Wix), userId weglaten bij pre-onboarding analyses om FK-violations te vermijden (commit `d909c65`)

### 2026-04-23 — Filly AI-laag
- ✅ `0009_ai_usage.sql` — migratie voor Claude-call tracking
- ✅ `AiService` centrale wrapper + `AiCallMeta`-type dwingt tracking af
- ✅ `AiRateLimitGuard` — 100 calls/uur/restaurant
- ✅ Review-reply-suggesties via Claude (toon B, geen handtekening)
- ✅ 3-varianten-kiezer in reviews-modal met page-level persistence
- ✅ Filly-chat met persistente `chat_messages`-historie
- ✅ `RestaurantContextService` — herbruikbaar context-blok voor alle Filly-prompts
- ✅ Chat v2: live weer + bezetting + reserveringen in system-prompt
- ✅ `CLAUDE.md` bijgewerkt
- ✅ `docs/supabase-manual-setup.md` — alles wat niet in migraties staat
- ✅ `apps/api/supabase/seeds/test_restaurants.sql`
