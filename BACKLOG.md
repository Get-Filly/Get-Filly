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

### Hosting-deploy (2026-05-08 → 2026-05-21 compleet)
- [x] ~~**Frontend live op `get-filly-web.vercel.app`**~~ — gedeployed 2026-05-08, beschermd met basic-auth middleware via env-vars `DEMO_AUTH_USERNAME` + `DEMO_AUTH_PASSWORD`. Vercel Hobby (geen native password-protection). URL kan privé gedeeld worden, browser-popup voor login.
- [x] ~~**API live op Railway** `api-production-9682.up.railway.app/api`~~ (2026-05-21, commits `d9d61f6` + `881fac1` + `15a5e7b` + `551177c`). Vercel-route afgeschreven (Nest = persistent server, niet serverless). Railway-config: `railway.json` in repo root met `pnpm install --filter "api..."` + `pnpm --filter api build` + `start:prod`. **Node 22.x verplicht** (engines + .nvmrc) — jose@6 is ESM-only en `require(esm)` is pas default vanaf Node 22. CORS in `apps/api/src/main.ts` leest `WEB_URL` + `CORS_ORIGINS` uit env. Watch Paths leeg = redeploy bij elke main-push. Env-vars 1-op-1 uit lokale `.env` overgezet, behalve `WEB_URL` (lokaal localhost:3000 → prod Vercel-URL). Bewezen werking: `curl /api/hello` → 200, login + dashboard zonder Geen-toegang-melding.
- [x] ~~**CI Suspense-fix**~~ (2026-05-21, commit `28bdfe2`) — Next.js 15+ vereist `<Suspense>`-wrapper rond `useSearchParams()` voor prerender. Account-page + google-business/reviews waren broken; refactor: inner-component houdt hooks, default-export wikkelt 'm in `<Suspense fallback={null}>`. Vercel-build was groen sindsdien.
- [ ] **Bundle '+ Kanaal toevoegen' (fase 4b)** — op `/campagnes/bundle/[id]` staat de knop nu disabled. Implementatie: POST `/campaigns/bundle/:groupId/channels` met `{platform, body, subject_line?, scheduled_for?}` → maakt nieuwe campagne onder dezelfde group_id. UI: platform-keuze-modal of toggle-pillen zoals voorstel-pagina. Optioneel Filly-tekst-generate voor het nieuwe kanaal.

### Autonome detectie + push-meldingen (concept-flow, 2026-05-08)
Eigenaar's vision: Filly checkt dagelijks (event-driven via reserveringsplatform), spot rustige dagen op basis van threshold, push-melding naar eigenaar → klik → genereer voorstel → bundle ontstaat in /campagnes.
- [ ] **Low-occupancy threshold per restaurant** — nieuw veld `low_occupancy_threshold_pct` op restaurants-tabel + slider in account-settings. Default 50%. Vervangt hardcoded waarde in `detectAndGenerateLowOccupancy`.
- [ ] **Autonome detectie** — bij data-event vanuit reserveringsplatform (Zenchef etc.) automatisch `detectAndGenerateLowOccupancy` triggeren (i.p.v. handmatige knop). NB: per memory géén interne cron, alléén event-driven.
- [ ] **Push-meldingen** — opties: (a) Email-interim via Resend (snel, 2-3u), (b) Web Push via PWA (10-12u, werkt cross-platform), (c) Mobile app + native push (weken, App Store). Sprint-keuze: start met (a), later (b).

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
- [x] ~~**Per-request Supabase-client met user-JWT**~~ (2026-05-01) — `RequestSupabaseService` (Scope.REQUEST) bouwt per HTTP-call een Supabase-client met het user-JWT uit de Authorization-header. RLS-policies pakken het via `auth.uid()`. AuthGuard zet `req.accessToken` na verify. 13 services gemigreerd: Menu/Reviews/Guests/Reservations/Occupancy/Kpi/Campaigns/Suggestions/Chat/ChatMemory/Restaurant/DataExport/Weather/RestaurantContext. **Bewust op service_role gebleven**: AuditLog (audit-integriteit), Anonymization (background), AccountDeletion (raakt auth.users), Onboarding (restaurant_users-link bestaat nog niet), AiService (alleen ai_usage-logging), TeamService (gebruikt auth.admin.inviteUser/generateLink). RLS-tests bewezen op DB-niveau: cross-tenant SELECT → `[]`, cross-tenant INSERT → HTTP 403 + `new row violates row-level security policy`.
- [ ] **`@RequireModule`-decorator** — backend enforced per-module permissies (nu alleen frontend-filter op sidebar)
- [x] ~~**Audit-log vullen**~~ (2026-04-30) — alle 6 service-domeinen schrijven nu naar `audit_log` met echte `userId`. Zie Data Analyst-sectie voor exhaustief overzicht.
- [ ] **Email-change flow** — account-pagina
- [ ] **2FA setup** — `users.two_factor_enabled` kolom bestaat, geen UI
- [ ] **Pre-onboarding rate-limit naar Redis** — nu in-memory Map in `OnboardingController`. Overleeft geen multi-instance deploy; vervangen door Redis/Upstash zodra api op Railway schaalt.

### Email & campagnes (gepromoveerd van P2 → P1)
- [ ] **Resend als SMTP-provider voor Supabase Auth** — configureer Resend onder Supabase Auth → SMTP Settings. Lost de 3-4/uur rate-limit op Supabase default SMTP en maakt confirmation-email weer bruikbaar in dev. Onze custom templates blijven werken; Supabase stuurt ze via Resend i.p.v. eigen SMTP.

### Campagne-flow cleanup (post-unification, 2026-05-13)
Sinds [main 61d26ed](https://github.com/Florisbwkoevermans/get-filly/commit/61d26ed) heeft `/campagnes/[id]` één gedeelde detail-view (status-aware) die identiek is aan `/voorstel/[id]`. Mig 0041 + 0042 zijn live, smart-detect op bundle-API werkt, 5 gedeelde componenten in `_components/campaign-detail/`. Hieronder de openstaande punten uit de data-analyst-review.

**Bugs (urgent):**
- [ ] ⚠️ **"Activeer nu" stuurt mail niet daadwerkelijk** — `handleStatusChange('actief')` in `apps/web/src/app/dashboard/campagnes/[id]/page.tsx` doet alleen `updateCampaignStatus`. De echte mail-send zit op `POST /campaigns/:id/send` (`apps/api/src/mail/mail.service.ts:91`) en wordt nergens aangeroepen. Stille no-send. **Fix**: bij type='mail' óók `sendCampaignByMode` aanroepen of confirm-modal terugzetten (CampaignSendModal bestaat nog).
- [ ] **InhoudCard `originalIdxRef` reset niet** bij client-side nav tussen 2 verschillende campagnes (zelfde route, ander `[id]`) → ✕-knop wijst naar de oude origineel. Fix in `apps/web/src/app/dashboard/_components/campaign-detail/inhoud-card.tsx:80`: reset op `sectionId`-of-`variants`-prop-change.
- [ ] **Multi-channel status-overgang heeft geen rollback** — `Promise.all(updateCampaignStatus)` over kanalen. Bij partial failure: halfgeplaatste bundle. **Fix**: nieuw endpoint `PATCH /campaigns/bundle/:id/status` met transactionele update over alle siblings.

**Dead code (na refactor niemand importeert het meer):**
- [ ] **4 components slopen** — `campaign-refine-panel.tsx` (22 KB), `campaign-schedule-panel.tsx` (13 KB), `campaign-media-slot.tsx` (13 KB). `campaign-send-modal.tsx` (9 KB) alléén slopen ná de "Activeer-stuurt-mail"-fix; deze is misschien juist nodig.
- [ ] **Dode API-functies in `apps/web/src/lib/api.ts` schrappen** — `fetchCampaignVariants`, `generateCampaignVariants`, `updateCampaign`, `suggestCampaignSchedule`.
- [ ] **Dode backend-endpoints + service-methodes schrappen** — `GET /campaigns/:id/variants`, `POST /:id/refine`, `PATCH /:id`, `POST /:id/suggest-schedule` + `service.getVariants/refine/update/suggestSchedule`.
- [ ] **Oude `/campagnes/bundle/[id]/page.tsx` slopen** (354 regels) — geen kanban-route gaat er nog naartoe.
- [ ] **Mig 0043: DB-schema cleanup** — drop `campaigns.filly_variants`, `campaigns.filly_variants_regen_count`, `campaigns.variant_applied_at` ná het verwijderen van alle write-paden. Bewaar als 2-stap (eerst writes weg in code, sessie later columns droppen) om mid-refactor data-verlies te voorkomen.

**Polish (nice-to-have):**
- [ ] **Approve-redirects consistent** — "Direct inplannen" + `approveBundleSuggestion` (chat_bundle) navigeren nu naar `/campagnes` (kanban). Voor consistentie: naar `/campagnes/${anchorCampaignId}` zodat eigenaar de net-gemaakte campagne meteen ziet.
- [ ] **Variant-delete knop** — eigenaar kan via "Genereer 3 nieuwe" tot 6 versies opbouwen, daarna zit-ie vast. Voeg ✕-knop op alternatief-blokken (alleen op concept) toe → `DELETE /campaigns/:id/variants/:idx`.
- [ ] **`findBundle` N+1 → batch** — per content-tabel 1 SELECT met `IN (campaign_ids)` ipv `findById` per kanaal. Geen blocker voor 1-5 kanalen, wel voor toekomstige >10-kanaal-bundles.
- [ ] **KanalenCard add/remove voor concept-bundles** — staat nu `canEdit=false` omdat de backend geen "add channel to bundle"-endpoint heeft. Vereist nieuw `POST /campaigns/bundle/:id/channels` dat een nieuwe campaign in dezelfde group_id aanmaakt.

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

### Health-score v1 live (2026-05-23) — V2-roadmap
- [x] ~~**v1 live**~~ (2026-05-23) — `/dashboard/google-business/audit` (route hergebruikt, was Profiel-audit). 4 runners (SEO/GBP/Reviews/GEO) + CompetitorCollector in 500m straal. Gewichten: GBP 30 / SEO 25 / Reviews 25 / GEO 20. Score 0-100 met sub-scores, acties-lijst gesorteerd op pointsLost, concurrent-tabel, trend-grafiek, tabs-UI met deep-dive per categorie. POST /health/run + GET /health/latest + /health/history. Migratie 0045. Volledige analyse-uitleg in `docs/health-score-analyse.docx` (12 hoofdstukken, kritische bedenkingen per categorie). Geen extra API-key nodig: hergebruikt `GOOGLE_PLACES_API_KEY` + Claude `ANTHROPIC_API_KEY` + PageSpeed werkt gratis tot 25k/dag/IP.
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
- [x] ~~**Writing-styles & beslissingsraamwerk uitschrijven (Word-document)**~~ (2026-05-24) — `docs/filly-brein.docx` v1 live met 24 hoofdstukken: input-signalen + redeneer-flow + 6 kanaal-secties (mail/IG/FB/TikTok/WA/GBP) met lengte/tone/hashtags/timing/CTA/visueel + critic-stem + bronnen (Sprout Social, Hootsuite, HubSpot, Later, Litmus, BrightLocal, Whitespark) + urgentie-vs-optimum-framework + anti-repetitie-mechanisme + performance-tracking-leerloop + funnel/lifecycle + segmentatie/targeting + content-types/UGC + brand-stem-archetype + AI-risico's + operationele rails + complete website-implementatie-checklist. Investor-ready in dezelfde stijl als health-score-analyse.docx.

### Filly-brein v2 → code-vertaling + website-implementatie (van filly-brein.docx)
**Het document `docs/filly-brein.docx` is de bron-van-waarheid voor onderstaande taken. Open dat eerst.**

#### Filly-brain config + prompts (geen externe afhankelijkheden)
- [x] ~~**filly-brain.config.ts**~~ (2026-05-24) — typed `CHANNEL_RULES` voor 8 kanalen met copyLength/hashtags/bestTimes/leadTime/frequency/visual/tone/cta + `CHANNEL_MIX_PER_THEME` + `FUNNEL_STAGE_TO_CHANNELS` + `PERSUASION_EXAMPLES` (Cialdini 6) + `DEFAULT_RATE_LIMITS` + `SUCCESS_SCORE_THRESHOLDS` + `ANTI_REPETITION_THRESHOLDS`. Helpers `buildAllChannelsBlock` + `classifyLeadTime` + `planChannelPlacement` + `buildAnchorKeywords`. `CHANNEL_RULES_VERSION = 'v1'`.
- [x] ~~**System-prompts migreren naar config**~~ (2026-05-24) — chat.service.ts + suggestions.service.ts injecteren `buildAllChannelsBlock()` vóór CONTEXT-sectie; "VARIATIE OVER 3 VARIANTEN"-regels dwingen 3 verschillende tone-signatures af. Bestaande FORMAAT 1/2-templates blijven (centrale regels leidend bij conflict). Tool-schema-uitbreiding met `funnel_stage`/`tone_signature`/`length_target` nog open (vereist Anthropic tool-use migratie van bestaande text-blokken).
- [ ] **suggestSchedule met urgency-logica** (hfst 7) — bereken tijd_tot_doel, kies sweet-spot binnen optimum-interval, anders zo dichtbij nu mogelijk, log reden in `scheduled_reasoning`. Skip kanalen onder minimum. `planChannelPlacement()` helper bestaat al in filly-brain.config; alleen suggestSchedule-prompt aansluiten.
- [x] ~~**campaign_style_fingerprints-tabel**~~ (2026-05-24, mig 0048) — opening_pattern / hashtag_set / cta_template (enum) / theme / primary_dish_mentioned / tone_signature (enum) per kanaal. RLS via user_has_restaurant_access + restaurant_id-denormalize.
- [x] ~~**Anti-repetitie-context loader**~~ (2026-05-24) — `CampaignFingerprintService.buildLearningContextBlock()` laadt top-3 winners + top-3 underperformers per kanaal via JOIN met campaign_performance, plakt 'm in chat + suggestions-prompts als "SUCCESSFUL/AVOID PATTERNS". Anker-keywords-helper aanwezig in filly-brain.config maar nog niet actief gebruikt in similarity-check (komt bij anti-repetitie post-generation v2).
- [ ] **Post-generatie-validatie** (hfst 8.6) — Jaccard hashtag-overlap + opening-overlap + cta-template-frequency. Bij overschrijding: warning in UI naast variant, geen auto-regenerate. Drempels staan al in `ANTI_REPETITION_THRESHOLDS`.
- [ ] **3-varianten-3-tone-signatures afgedwongen via tool-schema** (hfst 8.4) — Filly-prompts hebben nu instructie in tekst maar tool-schema dwingt het niet hard af; migreer van `<<FILLY_PROPOSE_CAMPAIGN>>`-text-blokken naar Anthropic tool-use voor strikte validation.
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
- [ ] **Per-restaurant-benchmarks vanaf 20+ campagnes** (hfst 9.4) — eigen mediaan i.p.v. industry-default. Drempel zit in `SUCCESS_SCORE_THRESHOLDS` maar de mediaan-berekening + override-logica nog niet.
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
- [ ] **IG/FB Insights-fetcher** (hfst 9.2) — dagelijks post-stats via Meta Graph API.
- [ ] **UGC tag-detectie** (hfst 13.4) — Meta API poll naar tags van eigen account. ugc_pending-tabel.
- [ ] **FB Events i.p.v. posts** (hfst 16.4) — Filly maakt FB-event-objecten i.p.v. post-objecten voor events.
- [ ] **Auto-DM-templates voor UGC-toestemming** (hfst 13.4) — Filly stuurt pre-fab DM via Meta API.

#### Vereist TikTok Business OAuth
- [ ] **TikTok Insights-fetcher** — view/watch/share-stats per video.
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
- [ ] **Resend webhook signature-validatie** — Svix-signature header checken in `MailController.receiveWebhook`. Nu accepteren we alle calls op die endpoint. Voor productie verplicht.
- [ ] **Resend webhook URL configureren** in Resend dashboard zodra api publiek bereikbaar is (deploy)
- [ ] **Legal: DPA-template** — Verwerkersovereenkomst met klant. Resend + Anthropic + Supabase als sub-verwerkers vermelden in privacy-pagina.

### Integraties (OAuth)
- [ ] **Facebook/Instagram OAuth** — Meta Graph API, `pages_manage_posts` + `instagram_content_publish` (vereist App Review, 2-8 weken)
- [~] **Google Business Profile** — multi-fase implementatie (zie sectie hieronder)
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
    in Google + beperkte SEO-impact. Eventueel later integreren als
    extra channel in de chat-bundel-flow naast Mail/IG/FB.

- [~] **Fase C — Google Business Profile API approval-aanvraag**.
  Doc-stub klaar: [docs/google-business-approval.md](docs/google-business-approval.md)
  met voorbereidingsstappen + invul-tekst voor het formulier. **Jouw
  actie**: APIs enablen in Cloud Console (5 stuks), OAuth consent screen
  configureren, formulier indienen. Wachttijd 2-6 weken voor approval.

- [ ] **Fase D — OAuth-foundation** (generiek, ook bruikbaar voor Meta/Zenchef).
  Migratie 0035: `oauth_connections`-tabel (provider, encrypted refresh-token,
  scopes, expires_at). Generieke `OAuthModule` met google-business-strategy.
  `/api/oauth/google-business/authorize` + `/callback` endpoints.
  Knop "Koppel met Google" op de hub-pagina. Status-banner switcht
  naar "Gekoppeld ✓" wanneer er een rij is voor restaurant_id +
  provider='google_business'.

- [ ] **Fase E — Reviews écht uit Google ophalen** (na approval).
  Sync-job 1× per uur per gekoppelde klant via
  `accounts.locations.reviews.list`. Bestaande reply-engine
  (`ReviewsService.refineVariants` etc — al klaar!) hergebruiken,
  alleen nieuwe push-stap naar Google's `accounts.locations.reviews.reply`.
  Migratie 0036: `reviews.google_review_id` + `responded_to_google_at`.
  Bestaande handmatig-ingevoerde reviews migreren / opruimen.

- [ ] **Fase F — Profiel-edits + foto-sync + Q&A**.
  Edit-queue met twee gates: eigenaar approves in Filly → push naar
  Google → Google's eigen review-queue (sommige velden direct live,
  andere door moderation). Foto-sync: media-library uit migratie 0031
  (al klaar!) + push naar `accounts.locations.media.create`. Q&A
  monitoring + Filly-antwoord-suggesties via
  `accounts.locations.questions.list`.

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

Laatst bijgewerkt einde sessie 2026-05-21 (laat) — Vindbaarheid-hub
+ Identiteit-verhuizing + auto-archive + restore-uit-historie +
progress-checklists herschreven.

**State op dit moment**:
- Demo-account `floriskoevermans@outlook.com` met restaurant_id
  `a462cf39-ef9b-49cb-bd8e-a84a10a3f888` gevuld met realistische
  data.
- **Migraties t/m 0042 in productie** (NB: 0039 bestaat niet,
  gereserveerd voor encrypted API-key-storage; volgende vrije = 0043).
- **Hosting compleet** (2026-05-21):
  - Frontend Vercel: `https://get-filly-web.vercel.app` (basic-auth
    `DEMO_AUTH_USERNAME` + `DEMO_AUTH_PASSWORD`).
  - Backend Railway: `https://api-production-9682.up.railway.app/api`.
  - `railway.json` in root, **Node 22.x verplicht** (engines + .nvmrc)
    voor jose@6 ESM-only. CORS leest `WEB_URL` + `CORS_ORIGINS` uit env.
  - Vercel env `NEXT_PUBLIC_API_URL` wijst naar Railway-URL.
  - CI groen sinds Suspense-fix `28bdfe2`.
- App is volledig responsive (1024 / 768 / 480 breakpoints).
- Tool-use migratie compleet — geen JSON.parse-fouten meer mogelijk.
- **Per-request Supabase-client live (2026-05-01)** — RLS-policies
  blokkeren cross-tenant reads/writes hard op DB-niveau. Alleen
  bewuste admin-flows draaien nog op service_role.
- **Campagnes-revisie 2026-05-12 (commits `720ae5a` + `1df6037`)**:
  - Unified kanban-card-layout door alle 4 statussen heen: titel +
    prominente datum onder titel + lichtgroene kanaal-chips + status-pill
    (✓ Alles compleet / ⚠ wat mist) + status-specifieke knoppen.
  - Acties per status: Voorstel = ✓ Goedkeur + × Afwijzen; Concept =
    📅 Plan in + × Verwijderen; Ingepland = ↩ Terugtrekken; Actief =
    read-only. Hoofdknop disabled tot ready; klik op grijs navigeert
    naar detail.
  - Detail-page voorstel: nieuw "Missende aspecten"-blok per kanaal
    + 📅 Direct inplannen-knop met confirm onder Goedkeur/Afwijzen.
  - Backend status-transities uitgebreid: concept→actief (voor "Activeer
    nu" toekomstig) en ingepland→concept (voor Terugtrekken).
  - Migratie 0040: soft-delete via `campaigns.deleted_at`. Verwijderde
    campagnes verschijnen in `/campagnes/history` onder tab "Verwijderd"
    naast "Afgerond".
  - Shared lib `apps/web/src/lib/campaign-checks.ts` met missing-field-
    logica (date/body/subject/photo); foto-vereiste alleen IG + TikTok.
  - UpcomingActionsBlock extracted naar shared component (gebruikt op
    dashboard + /campagnes).
  - MediaLibraryPicker upload + drag-drop direct in de modal ipv
    doorverwijzing naar Account-pagina.

### Volgende sessie — kies één van deze drie

1. **🔴 P0: Mollie-billing flow** — eerste klant kan niet betalen
   zonder. 4 sub-taken: SDK installeren + checkout-flow op pricing-
   pagina, migratie `subscriptions`-tabel (plan/status/mollie_customer_id),
   plan-enforcement in backend (limieten op AI-calls/campagnes/teamleden
   per plan), Mollie webhook voor status-changes (trial → active →
   cancelled). **Vereist**: Mollie-account aanmaken (zakelijk).

2. **🟡 P1: Site-fundamenten (publieke site)** — voor zodra je
   iemand naar `get-filly.com` stuurt. Contact/waitlist-formulier
   met Resend, 404-pagina, sitemap.xml, robots.txt, og-images per
   pagina, About-pagina met Floris-verhaal, footer invullen.
   **Vereist**: Resend-account voor het contact-formulier (ook
   nodig voor Supabase Auth SMTP straks).

3. **🟡 P1: Resend SMTP + email-confirmation weer aan** — Resend
   onder Supabase Auth → SMTP Settings configureren. Lost 3-4/uur
   rate-limit op. Daarna `Confirm email` weer aanzetten in Supabase
   Dashboard zodat fake-signups in productie geweerd worden.
   **Vereist**: Resend-account (overlap met taak #2).

### Mijn aanbeveling

**Begin met #1 (Mollie-billing)**. Het is de enige resterende
P0-blokker voor de eerste betalende klant — zonder kun je niet
live. Accountwerk (Mollie zakelijk) is sowieso onvermijdelijk en
kan parallel met de technische implementatie.

Site-fundamenten en Resend hangen aan een Resend-account — die
kun je in één keer doen zodra dat account er is.

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
- [x] ~~🔴 **Backend draait op `service_role`** → RLS bypass'd~~ (2026-05-01) — `RequestSupabaseService` (Scope.REQUEST) live; 13 services gemigreerd. RLS-policies nu defense-in-depth actief. Test bewees: cross-tenant SELECT → `[]`, cross-tenant INSERT → HTTP 403. Bewust op service_role gebleven: AuditLog/Anonymization/AccountDeletion/Onboarding/AiService(ai_usage)/TeamService(auth.admin).
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

### 2026-05-21 (laat) — Vindbaarheid-hub + Identiteit-verhuizing + progress-checklists

Commit `64e9875`. Vindbaarheid is nu het knooppunt voor alle posts-input.

**Verstreken campagnes auto naar historie** (item 2):
- **Migratie 0043**: pg_cron-job `cleanup_expired_campaigns` dagelijks
  03:17 UTC migreert non-afgeronde campagnes met `scheduled_for` in
  het verleden naar `status='afgerond'`. SECURITY DEFINER + search_path,
  idempotent re-runnable (drop+create job).
- Frontend kanban `/campagnes` + history-page filteren ook read-time
  (Array.isArray-safe + scheduled_for<nu) zodat de UI tussen cron-runs
  consistent is. History-tab 'Afgerond' toont nu OOK verstreken-niet-
  afgerond als safety-net.

**Restore-uit-historie** (item 3):
- Backend `POST /campaigns/:id/restore` + `restoreFromHistory()` met
  validatie: status concept|ingepland|actief, scheduled_for in toekomst
  (60-sec marge), bron is echt historie (status='afgerond' OR expired).
  Bij restore: `executed_at` op null + audit-log met from/to-status.
- Frontend `restoreCampaignFromHistory()` in api.ts.
- History-pagina krijgt 'Terugzetten'-knop per Afgerond-rij + modal met
  status-radios (concept/ingepland/actief, default ingepland) +
  datetime-picker met min=nu.

**Dagen filteren waar al voorstel/campagne staat** (item 1):
- `UpcomingActionsBlock` fetcht nu ook `fetchSuggestions("pending")` +
  `fetchCampaigns()`, bouwt `coveredDates`-Set van YYYY-MM-DD-strings
  (target_date uit pending suggesties + scheduled_for date-portie uit
  non-afgeronde campagnes) en filtert beide stroken + de popover.
- Variabelnamen `redStrip`/`yellowStrip` hernoemd naar `occupancyStrip`/
  `specialStrip` (legacy naming verwarde — beide stroken hebben al
  dezelfde rode accent-streep).

**Vindbaarheid-Identiteit verhuizing** (Floris-redesign):
- **Migratie 0044**: 8 nieuwe kolommen op restaurants — `location_description`,
  `keywords`, `default_hashtags`, `tone_of_voice`, `do_not_mention`,
  `brand_story`, `awards`, `target_audience_segments`. Zod-schema in
  `restaurant-update.schema.ts` uitgebreid.
- Nieuwe pagina `/dashboard/vindbaarheid/identiteit` (route slug
  google-business/identiteit voor backwards-compat) met 5 sub-tabs:
  Basics / Toon / SEO / Menu / Online.
- **Filly-analyse-banner** bovenaan Basics/Toon/SEO triggert bestaande
  `analyzeRestaurantWebsite()` voor auto-invul. Disabled als website-URL
  ontbreekt; geen valse dirty-state na analyse.
- **Menu-tab**: `MenuPage` accepteert nu `embedded?: boolean`-prop —
  bij true skip page-shell (page-full wrapper + PageHeader), upload-
  acties inline boven menu-lijst. Identiteit-Menu-tab rendert
  `<MenuPage embedded />` direct.
- **Foto-bibliotheek + branding** verhuisd van Visueel-tab naar Basics-
  tab (Visueel-tab vervallen). Logo + brand-kleuren inline-velden,
  RestaurantMediaSection als embedded sectie.
- Sidebar Menu-item weggehaald. Route `/dashboard/menu` blijft als
  standalone bestaan voor deep-link-compat.

**Account-page grote opruim**:
- AccountTab: `algemeen | identiteit | koppelingen` → `algemeen |
  koppelingen`. `?tab=identiteit` valt nu terug op Algemeen voor
  bookmark-compat.
- **445 regels weggehaald**: 5 sub-secties (foto-bibliotheek,
  identiteit-velden, website, branding, social media, menu-link) +
  dode helpers (`setBrandColor`, `handleAnalyzeWebsite`, `handleLogoUpload`,
  `toneOptions`, `formatDate`) + ongebruikte imports.

**Vindbaarheid-hub (`google-business/page.tsx`) cleanup**:
- PageHeader-title `"Google Business Profile"` → `"Vindbaarheid"`,
  subtitle weg.
- Koppeling-status-banner + `GoogleConnectModal` verwijderd. De
  koppeling beheert eigenaar nu uitsluitend via Account > Koppelingen
  (item `google_business` in `account-connections.tsx` bestond al,
  API-token-flow).
- Feature-cards: emoji-icoon weggehaald, layout naar "titel links +
  status-badge rechts".
- Identiteit toegevoegd als EERSTE card.

**Progress-checklists herschreven**:
- Nieuwe gedeelde `<ProgressChecklist>` in `_components/`:
  - Done items verdwijnen uit lijst (niet line-through)
  - Max 4 open items zichtbaar + "Toon nog N items ↓"-knop
  - Chevron-toggle voor inklappen (collapse-state in localStorage
    per `collapseKey`) vervangt permanente dismiss-X
  - Progress-bar altijd zichtbaar, ook bij ingeklapt
  - Verdwijnt alleen bij 100% complete
- `OnboardingChecklist` (account): 6 items → 4 items (logo + menu
  weggevallen, hoorden naar Vindbaarheid).
- `IdentiteitChecklist` per sub-tab: Basics (10 items), Toon (8 items),
  SEO (2 items) met builders die kijken naar de mig-0044-velden.

**TasksStrip "Overige acties"** vervangen door deze checklist-flow —
was al verwijderd in commit `167c7ea` (eerder vandaag).

**Emoji-cleanup**:
- 8 feature-card-emoji's weg uit Vindbaarheid-hub.
- ✨ + 📭 weg uit menu-suggestions empty-state.

**Vereiste hand-actie**: migratie 0043 + 0044 SQL in Supabase
draaien (beide al door Floris ge-run, bevestigd via "schaduled 3"-
return van pg_cron + "heb hem gerund").

### 2026-05-21 (avond) — Campagne-flow fixes + GBP-channel + sticky UI

**Vijf samenhangende verbeteringen** (commit `fd05949`, voorafgegaan
door `94ebb7f` met landing-design pass + visualizer-rebuilds).

**Multi-channel refine bug fix** (HTTP 400 "max reached"):
- Backend `refine()` in `apps/api/src/suggestions/suggestions.service.ts`
  leest + schrijft nu `channels[i].variants` i.p.v. legacy
  `sc.variants`. Bij channels[]-suggesties target het de actieve
  channel via `body.channel_id`; bij legacy single-channel werkt
  het op sc.variants (backwards-compat).
- Controller accepteert nieuw veld `channel_id`.
- Frontend `refineSuggestion(suggestionId, instruction, channelId?)`
  + voorstel-page `handleRegenerate()` passt `activeChannel.id` door.
- Persistence werkt automatisch: nieuwe varianten worden in DB
  opgeslagen → blijven zichtbaar bij refresh + navigatie.

**Google Business als 6e campagne-kanaal**:
- Backend `SuggestionPlatform` + `SUGGESTION_PLATFORMS` uitgebreid met
  `'google_business'`. `platformToCampaignType` mapt 'm naar `'social'`
  (hergebruikt bestaande `campaign_social_content`-tabel; geen
  migratie nodig — `platforms text[]` accepteert nieuwe waarde).
- Frontend Platform-type + PLATFORM_ICON (🔍) + PLATFORM_LABEL
  ("Google Business-post") toegevoegd in
  `_components/campaign-detail/types.ts`.
- KanalenCard `ALL_PLATFORMS` bevat nu ook `google_business` als
  6e toggle-pill naast Mail/WhatsApp/IG/FB/TikTok.
- Concept-fase volledig functioneel (Filly genereert, eigenaar
  bewerkt + plant in, status werkt). Auto-publish via GBP-API wacht
  op approval (BACKLOG fase F). Eigenaar kopieert handmatig naar
  Google Business tot dan toe.

**`channels.map is not a function` crash op /campagnes**:
- `getItemPlatforms` + dates-helper checken nu `Array.isArray()`
  i.p.v. alleen `?? []`. Legacy bundle-suggestions hadden channels
  als object opgeslagen wat `.map()` crashte.

**Kanban-sortering op datum**:
- Elke kolom (Voorstel/Concept/Ingepland/Actief) sorteert op
  vroegste scheduled-datum oplopend. Items zonder datum naar
  onderaan zodat geplande dingen prominent zijn.

**Sticky-header detail-pages** (`/campagnes/[id]` + `/voorstel/[id]`):
- Eén sticky-blok van "Terug naar campagnes" t/m de progress-balk
  plakt nu onder de dashboard-topbar tijdens scrollen.
- `.page-full` krijgt inline `paddingTop:0` zodat sticky met `top:0`
  flush onder topbar pint (anders 24px gap door de standaard
  page-full padding; negatieve top clipt de sticky boven de
  scroll-area).
- Topbar zelf: `rgba(.88) + backdrop-blur` → fully opaque
  `var(--bg)` zodat content niet meer doorschemert bij scrollen
  (was zichtbaar tussen topbar en sticky-blok).

**Sidebar/topbar label "Google Business" → "Vindbaarheid"** (commit
`94ebb7f`):
- `_components/sidebar.tsx`: label + icoon 💼 → 🔍.
- `_components/topbar.tsx`: page-title-map bijgewerkt.
- Route + module-key (`google-business` / `google_business`) blijven
  voor backwards-compat met deep-links + permissies.

**Landing-design pass** (commit `94ebb7f`):
- Border-radius bumped: zig-card 12→24, pricing-card 8→20, faq-item
  8→16, feature-row-text--card 20→24, testimonial 16→20.
- VindbaarheidVisualizer v4: cirkel-layout rond Filly met 8 echte
  brand-SVGs (Simple-Icons paths + custom voor TheFork/ChatGPT/Maps).
  Solide aderen, sequentiële reveal, pulsen Filly → logo.
- ZichtbaarheidVisualizer v3: hybride HTML+SVG met grote Filly-cirkel
  centraal + IG/FB/TikTok platform-cirkels + mini-cards met bullets
  (matcht originele PNG). Gebogen pijl-arcs met pulsen.
- Pijler 3 (Bereikbaarheid) ook in `--split`-patroon (tekst-card +
  transparante visual) voor consistentie met pijler 1 + 2.

### 2026-05-21 — Hosting compleet (Vercel + Railway) + CI-fix + mig 0041/0042

**Wat is er gebeurd**: alles wat tot vandaag alleen lokaal werkte
loopt nu volledig op de cloud — frontend op Vercel, backend op
Railway. Plus twee migraties bijgewerkt die nooit waren gedraaid
(Filly-chat crashte op "selected_variant_index column not found").

**Frontend Vercel** (`https://get-filly-web.vercel.app`):
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  + `NEXT_PUBLIC_API_URL` (= Railway-URL) gezet in Vercel UI.
  Onder "Sensitive" gemarkeerd; bij wijzigen redeploy nodig want
  `NEXT_PUBLIC_*`-vars worden in build ge-baked.
- Eerdere fetch-error "Invalid value" was een corrupte env-value
  (URL met `/rest/v1/` erachter). Gefixt door clean overnieuw plakken.

**Backend Railway** (`https://api-production-9682.up.railway.app/api`):
- Routekeuze: Vercel-API-pad afgeschreven omdat Nest een persistent
  server is, niet serverless. Vercel Hobby 10s-timeout zou Vision-
  flow breken (Opus-menukaart-upload duurt 30-60s).
- `railway.json` in repo root:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
      "builder": "NIXPACKS",
      "buildCommand": "pnpm install --frozen-lockfile --filter \"api...\" && pnpm --filter api build"
    },
    "deploy": {
      "startCommand": "pnpm --filter api start:prod",
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
- **Node 22.x verplicht**. Railway pakte default Node 18 (jose@6
  crashte met `ERR_REQUIRE_ESM`). Met `engines.node: "22.x"` in
  root `package.json` + `.nvmrc=22` koos Nixpacks Node 22.18.1.
  jose@6 is ESM-only; `require(esm)` is pas standaard vanaf Node 22.
- CORS in `apps/api/src/main.ts` leest nu env-vars i.p.v. hardcoded
  localhost:3000 — `WEB_URL` (single) + optioneel `CORS_ORIGINS`
  (comma-list). `credentials: true` voor Authorization-header.
- Env-vars 1-op-1 uit lokale `apps/api/.env` overgezet (Supabase
  + Anthropic + Resend + Google Places + access-tokens), behalve
  `WEB_URL` (lokaal localhost → prod Vercel-URL).
- Railway service-config: Watch Paths leeg = redeploy bij élke
  main-push. Service heet `api`, port 8080 (via PORT env-var),
  publieke URL via Generate Domain.

**CI-fix** (commit `28bdfe2`):
- `useSearchParams()` was unwrapped op `/dashboard/account` +
  `/dashboard/google-business/reviews` — Next.js 15+ vereist
  `<Suspense>`-boundary anders crasht production-build met
  CSR-bailout-error.
- Refactor patroon: inner-component houdt hooks/UI, default-export
  wikkelt 'm in `<Suspense fallback={null}>`. Lokaal getest met
  `next build` voor push.

**Database — mig 0041 + 0042 gedraaid**:
- 0041 ontbrak in productie. Backend probeerde
  `selected_variant_index` te schrijven bij chat-bundle approve →
  PGRST204 schema-cache-error → Filly-flow brak op stap 2.
- Diagnose-query op `information_schema.columns` bevestigde dat
  alleen 0041 (variants + selected_variant_index) ontbrak; alle
  andere kolommen t/m 0040 stonden goed.
- Gecombineerde idempotente SQL gerund: ADD COLUMN IF NOT EXISTS +
  backfill per type (mail/social/whatsapp). Tested: chat-approve
  werkt nu end-to-end.

**Commits**: `28bdfe2`, `d9d61f6`, `881fac1`, `15a5e7b`, `551177c`.

### 2026-05-06 — Sessie afronding: UX-cleanup + IG/FB full-preview + content-fixes

**Onboarding stap 1 — visuele fine-tuning**:
- Subtitle: "in stap 2" → "in de volgende stap" + komma toegevoegd
  voor "dan" (grammaticaal correct als-dan-constructie)
- "✨ Laat Filly de rest invullen"-kop weggehaald
- UploadCard-component voor menu + drankkaart (papier-warm bg,
  brand-groen border bij upload, 'Vervangen'/'Verwijderen'-acties)
- "Filly, vul alles in" altijd zichtbaar (was alleen bij input):
  lichtgroen disabled bij geen input, brand-groen clickable bij input
- "Volgende — review" → "Volgende"
- Bruine kleur voor Filly-knop verworpen, brand-groen bleef passender
- Spacing-fix: `.login-btn`-class had ingebakken margin-top:24px die
  conflicteerde met inline marginTop — beide gaps nu gelijk op 16px

**'zaak' → 'onderneming' (23 files, sweep)**:
- Alle user-facing strings in apps/web (marketing/legal/dashboard)
  + Filly's system-prompts in apps/api (chat/suggestions/menu-
  suggestions/campaigns/reviews/restaurant-context). Code-comments
  + technische type-namen blijven 'zaak' (intern).

**Email-templates**:
- `GET FILLY` (uppercase, hardcoded) → `Get-Filly` in header-logo
  van alle 4 auth-mails (invite/magic_link/recovery/confirmation)
- Alle subjects + body-teksten ook met streepje
- `pnpm supabase:apply-templates` gerund — live op Supabase

**Marketing-hub fixes**:
- IG/FB/TikTok-cards op de hub waren niet klikbaar; nu wel
- Mini-stats (Verzonden + Open rate) van Mail-card weggehaald —
  alle 5 cards uniform
- Layout-fix: alle Marketing- en Google Business-pagina's gewrapt
  in `<div className="page-full">` zodat ze dezelfde links/rechts
  marge hebben als Koppelingen

**Instagram & Facebook full-preview** (na keuze A):
- /dashboard/marketing/instagram volledig uitgewerkt met realistische
  voorbeeld-data: 4 KPI-tegels, SVG-bereik-grafiek, top 5 posts,
  posttijd-heatmap, content-mix-tabel, publiek-demografie, Filly-
  acties. Gele preview-banner duidelijk zichtbaar.
- /dashboard/marketing/facebook idem maar met FB-specifieke metrics:
  page-likes, reactions-mix (👍❤️😮😂😢😡), Foto/Video/Event/Link-
  content-types, lunch-piek-pattern in heatmap, ouder publiek
  (zwaartepunt 35-54).

**Filly-voorstellen — compactere kaart + opgeschoonde modal**:
- Kaart op /campagnes: body-preview 220→140 chars, hele Expected-
  impact-blok weggehaald (+ reserveringen / Geschatte omzet /
  Confidence-bar), reasoning naar onder de actie-knoppen verplaatst
- Detail-modal: chat-edit-flow ('Praat met Filly'-rechterkolom) weg
  — verwarrend tov dashboard-chat. Single-column layout. Nieuwe
  'Genereer nieuwe versies'-knop hergebruikt refineSuggestion-API.
  -256 regels code (modal werd veel cleaner).

**Bug-fixes onderweg**:
- SuggestionsService.generateOnDemand crash bij Claude-tool-use-
  failure: defensieve `Array.isArray(raw.suggestions)` guard +
  nette NL-melding ipv 500-stacktrace.

**Demo-account herstel**:
- Floris had per ongeluk `floriskoevermans@outlook.com` verwijderd
  via account-delete (UX-issue: niet duidelijk dat 't álle restaurants
  weghaalt). Geen Pro-plan = geen Supabase backups beschikbaar.
- Opgelost: nieuwe signup + SQL-snippet die 8 gasten / 15 reserveringen
  / 14 occupancy-dagen / 6 reviews / 4 campagnes / 2 ai_suggesties /
  5 menu-items invoegt (auto user-id-lookup via email).
- Op backlog: soft-delete met 7-day window om dit nooit meer te
  laten gebeuren bij echte klanten.

**Memory bijgewerkt**:
- `feedback_auto_push.md` — workflow: na elke afgeronde wijziging
  automatisch commit + push (geen vooraf-vraag meer)
- Project-state-memory bijgewerkt met sessie-state

**Nog open na deze sessie**:
- TikTok-pagina full-preview (zelfde patroon als IG/FB) — niet
  gevraagd om nu te doen
- Soft-delete account met 7-day window (UX-fix)
- KvK-inschrijving (Floris's actie)
- Meta + TikTok approval-aanvragen indienen (na KvK)
- GBP approval-aanvraag indienen (na KvK)

### 2026-05-06 — Marketing-hub fase 1 (Mail live + IG/FB/TikTok placeholders)

**Probleem dat dit oplost**: klanten hadden geen overkoepelend overzicht
van hun marketing-prestaties per kanaal. Mail-data zat verstopt op
campagne-detail-pagina's, sociale kanalen waren überhaupt nog niet
beschikbaar. Nu één hub waar Filly later cross-channel kan adviseren.

**Architectuur**:
- Sidebar-entry "Marketing" tussen Campagnes en Google Business
- Hub: `/dashboard/marketing` met status-banner ("X van 4 kanalen
  actief"), Filly's wekelijks rapport (vanaf 1 actief kanaal),
  4 kanaal-cards (Mail / IG / FB / TikTok) + WhatsApp als "Later"
- Module-key `marketing` in `@getfilly/shared` (default-permissions
  voor owner + manager). Geen migratie nodig — bestaande klanten
  zonder custom permissions krijgen 'm automatisch.

**Mail-pagina LIVE** ([apps/web/.../marketing/mail/](apps/web/src/app/dashboard/marketing/mail/)):
- 5 KPI-tegels: verzonden / open rate / click rate / bounce rate /
  unsubscribes
- Industrie-mediaan-vergelijking (horeca-benchmark, hardcoded uit
  Mailchimp 2024-2025 industry-report)
- Per-campagne tabel (laatste 90 dagen) met clickable links naar
  campagne-detail
- Backend: [apps/api/src/marketing/](apps/api/src/marketing/) met
  `MarketingMailService` die `campaign_sends`-data aggregeert.
  Endpoints `/marketing/mail/stats` en `/marketing/mail/campaigns`.
- Empty-state als nog geen mail verzonden — verwijst naar /campagnes

**Coming Soon-pagina's** (IG / FB / TikTok):
- Gedeeld `<ComingSoonChannel>`-template
- Per platform een lijst van wat er straks komt (mockup-beschrijving)
- "Naar de hub"-link + "Bekijk Mail (werkt al)"-link

**Filly's wekelijks rapport** (eenvoudige versie):
- Deterministische tekst-samenvatting op basis van mail-stats
- Vergelijking met benchmark + suggesties bij outliers (bounce >3%,
  click <1% etc.)
- Echte Claude-call met cross-channel-analyse komt in fase 6

**LinkedIn**: bewust uit scope. Voor horeca lage relevantie. Mochten
hotel-restaurants of event-locaties klanten worden, kan 't later als
extra kanaal-card.

**Volgende fases (in BACKLOG, niet vandaag)**:
- Fase 2: `docs/meta-app-review.md` schrijven met invul-tekst
- Fase 3: Floris dient Meta + TikTok-aanvragen in (parallel aan KvK)
- Fase 4: OAuth-foundation (migraties 0035/0036, generieke OAuthService)
- Fase 5: Insights API-koppelingen (na approvals)
- Fase 6: Filly AI-laag (cron rapport + per-platform analyse +
  action-detector + anomalie-detect)
- Fase 7: WhatsApp (apart Meta-traject)

### 2026-05-05 — GBP fase B: Places-API + audit + benchmark + posts

**Probleem dat dit oplost**: de hub-pagina had alleen "Coming Soon"-
cards. Eigenaar kon nog niks met Filly's Google-features. Vereist een
Google Cloud-koppeling die voor klanten zonder approval-wachttijd
direct waarde geeft — dat is precies wat de Places API mogelijk maakt.

**Setup buiten code** (door Floris):
- Google Cloud project `Get-Filly GBP` onder organisatie `get-filly.com`
- $300 free trial credit (90 dagen) + $200/mnd Maps-credit doorlopend
- API-key met restricties: alleen Places API (New), geen IP-restrictie
  voor lokaal dev (productie krijgt Railway-IP later)
- `.env`-var: `GOOGLE_PLACES_API_KEY`

**Backend** ([apps/api/src/google-profile/](apps/api/src/google-profile/)):
- `GoogleProfileModule` + `GoogleProfileService` met 7 public methods:
  searchByText, connect, getMine, refresh, disconnect, getAudit,
  getCompetitors, generatePostVariants.
- Cache-strategie: 24u TTL in `restaurants.google_place_data` jsonb.
  Stale-refresh fail-soft (toon oude data + log warning bij API-fout).
- `audit.ts`: 12 deterministische regels (geen Claude-call, gratis,
  sub-ms runtime). Severities: critical / warning / tip met
  actionHints in NL voor de eigenaar.
- Migratie 0034: `restaurants.google_place_id` (text) + `google_place_data`
  (jsonb) + `google_place_synced_at` (timestamptz) + index op place_id.

**Frontend** ([apps/web/src/app/dashboard/google-business/](apps/web/src/app/dashboard/google-business/)):
- Hub van server-component naar client-component met `GET /me` fetch
  bij mount. Drie banner-states (loading/connected/disconnected).
  `GoogleConnectModal` voor de "Koppel met Google"-flow met search
  → kies → connect.
- 2 sub-routes:
  - `/audit` — severity-checklist met 3 KPI-tegels + finding-cards
  - `/benchmark` — KPI's (jouw vs mediaan in buurt) + tabel met radius-
    selector
  - ~~`/posts`~~ — gebouwd maar dezelfde dag verwijderd na review.
    Overlap met Filly-chat ("schrijf een Google-post") + posts in
    Google verdwijnen na 7 dagen + beperkte SEO-impact. Eventueel
    later als 4e channel in de chat-bundel-flow.

**Onboarding-integratie**:
- `OnboardingController.analyzeWebsite` → na WebsiteAnalyzer ook
  `googleProfile.searchByText(name + adres)` → top-1 als `place_match`
  in de response.
- Wizard stap 2 toont nieuwe sectie "Filly heeft je profiel gevonden"
  met confirm/wijzig/skip. Wijzigen-flow heeft inline-search.
- `OnboardingService.completeOnboarding`: na restaurant-create + link
  → optionele `googleProfile.connect()` als wizard place_id meestuurt.
  Fail-soft.
- Nieuwe endpoint `/onboarding/google-search` (alleen AuthGuard, geen
  RestaurantAccessGuard) voor de wijzigen-flow tijdens onboarding.

**Bekend voor productie** (op backlog):
- IP-restrictie op API-key zetten zodra Railway-IP bekend (productie
  deploy)
- Aparte dev-key zonder IP-restrictie voor lokale ontwikkeling

### 2026-05-05 — Google Business Profile-hub (fase A: skelet + rename)

**Probleem dat dit oplost**: de oude "Reviews"-sectie suggereerde dat
Filly alleen iets met reviews kan, terwijl reviews één van de zeven
sub-features van een volledige Google Business Profile-integratie zijn.
De rename + hub-pagina maken duidelijk waar we naartoe gaan en wat
er nog komt — fase B-F kunnen nu één voor één live zonder de
navigatie steeds te wijzigen.

**Wijzigingen**:
- Sidebar: `Reviews` ⭐ → `Google Business` 🔵
- Route: `/dashboard/reviews` → `/dashboard/google-business` (oude
  route blijft als 308-redirect-stub voor bookmarks/audit-log-links)
- Reviews-pagina verhuisd naar sub-route `/dashboard/google-business/reviews`
- Module-key in `@getfilly/shared`: `reviews` → `google_business`
  (MODULES + DEFAULT_PERMISSIONS owner/manager)
- Migratie 0033: bestaande `restaurant_users.permissions`-jsonb
  bijgewerkt + audit-log-entry voor traceerbaarheid
- AccessGuard PATH_MODULE_MAP + topbar title-mapping bijgewerkt
- Tasks-strip + taken/page deep-links direct naar nieuwe locatie
  (geen onnodige redirect-hop)
- Team-pagina MODULE_LABELS bijgewerkt
- Hub-pagina (`/dashboard/google-business/page.tsx`) met 7 cards:
  - 🟢 **Reviews** (live, klikbaar — werkt met handmatige data tot
    fase E synchronisatie aanzet)
  - 🔵 **Profiel-audit** (Coming Soon, fase B)
  - 🔵 **Concurrent-benchmark** (Coming Soon, fase B)
  - 🔵 **Filly-posts (copy-paste)** (Coming Soon, fase B)
  - ⚪ **Profiel-edits** (Coming Soon, fase F — vereist OAuth)
  - ⚪ **Foto-sync naar Google** (Coming Soon, fase F)
  - ⚪ **Inzichten** (Coming Soon, fase F)
- Status-banner bovenaan: "Niet gekoppeld met Google" (hardcoded
  tot fase D `oauth_connections` live is)
- Responsive grid (`auto-fill, minmax(280px, 1fr)`) — geen breakpoints
  nodig, vult de rij vanzelf op

**Volgende fase**: B (Places-API laag) — vereist Google Cloud
project + Places API-key. Geen klant-actie of approval-wachttijd.

### 2026-05-04 — Chat-delete + cap 20→30

Eigenaar kan oude gesprekken nu verwijderen via een 🗑-knop in de
history-dropdown. Voor delete probeert backend de Haiku-summary op
te slaan (fail-soft) zodat Filly's geleerde voorkeuren in
`restaurant_chat_memory` bewaard blijven — alleen de chat-berichten
zelf gaan weg.

- `ChatService.deleteConversation` met memory-first-save + cascade-delete
- `DELETE /chat/conversations/:id` endpoint
- `Trash2`-icoon per rij in `FillyChatHistoryMenu` (rood-highlight bij
  hover) + confirm-dialog
- Bij delete van actieve conversatie: orchestrator start automatisch
  een nieuw gesprek
- `CONVERSATION_CAP` 20 → 30 (zowel backend als frontend constant)

### 2026-05-04 — Foto-bibliotheek + multi-channel campagne-bundles + chat keuze-kaart

Drie features in één sessie, opgebouwd op de mail-flow van eerder
deze dag.

**Foto-bibliotheek per restaurant** ([apps/api/src/restaurant-media/](apps/api/src/restaurant-media/)):
- Migratie 0031: `restaurant_media`-tabel + RLS. Cap 20 foto's, 5MB
  per stuk, JPEG/PNG/WebP.
- `MediaTaggerService`: Haiku 4.5 Vision genereert NL-beschrijving +
  3-5 tags per upload. Eenmalig ~€0.005/foto, daarna geen runtime-
  cost meer omdat tekst opgeslagen blijft.
- `RestaurantMediaService` met list/upload/remove via Storage bucket
  `restaurant-assets`. Public-URL i.p.v. signed (anon-read-policy uit
  mig 0003 was al actief voor logo's).
- Frontend `RestaurantMediaSection` op account-pagina: grid met
  thumbnails + cap-warning + delete.
- `MediaLibraryPicker`-modal hergebruikt door `CampaignMediaSlot`
  (campagne-foto kan nu ook uit bibliotheek worden gekozen — frontend
  fetcht de URL als blob en uploadt 'm naar campaign-media zonder
  backend-wijziging).
- `RestaurantContextService.buildPhotosBlock`: Filly krijgt 20 foto's
  met description + tags in indices [1]-[20] in z'n campagne-context
  zodat 'ie kan suggereren welke foto past.

**Multi-channel campaign-bundles** ([apps/api/src/chat/](apps/api/src/chat/) + [campaigns/](apps/api/src/campaigns/) + [suggestions/](apps/api/src/suggestions/)):
- Migratie 0032: `campaign_groups` + `campaigns.group_id`. Optie A
  uit overleg: bestaande campaigns-rijen blijven single-type, group
  is alleen aggregaat-anker voor UI en accept-flow.
- Filly-prompt uitgebreid met FORMAAT 2 (BUNDLE) — 1 thema, 3 kanalen
  (mail + IG + FB) met aparte caption-stijlen (lengte, hashtags, tone).
- `<<FILLY_PROPOSE_BUNDLE>>` parser-tag + `extractCampaignBundle`-
  parser parallel aan single-channel proposal.
- `SuggestionsService.createBundleFromChat` slaat bundle op als
  ai_suggestions-rij met `trigger_type='chat_bundle'`.
- `SuggestionsService.approveBundle` accepteert optioneel
  `channels: ('mail'|'instagram'|'facebook')[]` zodat eigenaar
  per kanaal kan kiezen welke wel/niet aangemaakt moet worden.
- `CampaignsService.create` uitgebreid met `group_id`, `social_platforms`,
  `social_hashtags` zonder bestaande callers te raken.
- Frontend `FillyChatBundleCard`: 3 collapsibles met checkbox per
  kanaal (default alle 3 aangevinkt, eigenaar kan uitvinken). Knop-
  label is dynamisch ("Maak 2 campagnes aan" / "Maak 3 campagnes aan").
  Bij accept: 3 doorlinks naar de aangemaakte campagne-detail-pagina's.
- Idempotency-fix: bij chat-history-load detecteert orchestrator of
  bundle al approved is via `approvedMap` en zet bundle-card op
  `approved_existing`-state met "✓ Bundle al aangemaakt" + open-link.
  Voorkomt dubbele aanmaak na page-reload.
- Bumped `maxTokens` voor chat-call van 600 → 2000: bundle-output
  (3 kanaal-versies + JSON) was te groot voor 600, kreeg truncated
  antwoord en daardoor failed parser.

**Channel-choice-kaart** ([apps/web/src/app/dashboard/_components/filly-chat-choice-card.tsx](apps/web/src/app/dashboard/_components/filly-chat-choice-card.tsx)):
- Nieuwe `<<FILLY_PROPOSE_CHOICE>>` tag — Filly stelt eerst een keuze-
  vraag aan eigenaar i.p.v. zelf het kanaal te beslissen.
- Multi-select met 4 checkboxes (Mail / Instagram / Facebook / WhatsApp)
  + "Selecteer alles"-toggle + Verstuur-knop met dynamic label.
- Submit-logica: 1 keuze → single proposal voor dat kanaal; 2+ keuzes
  → bundel.
- Server-side `detectChannelHint` in [chat.service.ts](apps/api/src/chat/chat.service.ts):
  scant user-message op kanaal-keywords en injecteert keiharde
  routing-instructie in de Claude-prompt ("Gebruik FORMAAT 0 — NIET
  direct een proposal/bundle"). Voorkomt dat Claude de prompt-regels
  negeert. Als de eigenaar een specifiek kanaal noemt → skip
  keuze-vraag direct.
- Refactor `sendMsg` → `sendText(text)` zodat de choice-handler
  automatisch een follow-up user-bericht naar Filly kan sturen na
  klik op Verstuur.

### 2026-05-04 — Mail-flow live (Resend SDK + send + unsubscribe + eigen domein)

**Probleem dat dit oplost**: campagne-mails stonden alleen als concept
in de DB. Geen daadwerkelijke verzending naar klant-gasten mogelijk —
de "actief"-status in Filly's flow betekende niets praktisch.

**Foundation** ([apps/api/src/mail/](apps/api/src/mail/)):
- `MailService` met Resend SDK. From-header `<restaurant-naam> <social@get-filly.com>`
  als default, klant-eigen `mail_from_address` zodra geverifieerd.
- Reply-to via `restaurant.contact_email` zodat replies bij de klant
  terechtkomen ondanks Get-Filly als afzender.
- Per recipient: token genereren + `campaign_sends` insert + Resend
  batch.send (max 100 per call). HTML-wrapper met footer + unsubscribe-link.
- RFC 8058 List-Unsubscribe headers (Gmail/Outlook tonen native
  unsubscribe-knop bovenaan de mail — deliverability-boost + GDPR).
- Pre-flight check op `subject_line` + `body_html`/`body_plain` uit
  `campaign_mail_content`-tabel; nette NL-foutmelding bij ontbrekende
  content.

**Migratie 0030**:
- `campaign_sends` met status-enum (queued/sent/delivered/bounced/
  complained/opened/clicked/failed) + Resend message_id voor
  webhook-koppeling
- `unsubscribe_tokens` (256-bit random, idempotent gebruik)
- `restaurants.mail_*`-velden voor stap 2 (eigen domein)

**Webhook-flow**:
- `POST /webhooks/resend` (publiek) handelt delivered/bounced/opened/
  clicked/complained af. Match op resend_message_id. Signature-
  validatie (Svix) staat als TODO voor productie.
- `POST/GET /public/unsubscribe/:token` voor one-click + RFC 8058

**Frontend**:
- `<CampaignSendModal>` op campagne-detail-pagina. Twee modes: "Test
  naar mezelf" (eigenaar checkt visuele inhoud) + "Echt verzenden"
  (vereist overtypen van campagne-naam ter bevestiging — onomkeerbaar).
- Resultaat-view toont sent/failed counts + lijst van mislukte adressen.
- Publieke `/u/[token]`-pagina met "Je bent uitgeschreven van X"-melding.

**Stap 2 — eigen domein per klant**:
- `MailDomainService` met Resend Domains API (create/verify/get/remove).
  Zet records op subdomains zodat bestaande mailbox-flow van klant
  intact blijft (DKIM op `resend._domainkey.<domein>`, MX+SPF op
  `send.<domein>`).
- `<MailDomainSection>` op account-pagina met:
  - 4 status-states (none/pending/verified/failed)
  - DNS-records-tabel met copy-knoppen
  - Auto-polling elke 12s in pending-state tot Resend status syncs
  - "Verifieer"/"Loskoppelen"-acties
- Bij verified status: `MailService.resolveFromAddress` switcht
  automatisch naar klant-domein als afzender.

**Bekend voor productie** (op backlog gezet):
- Resend webhook signature-validatie (Svix-secret)
- Resend webhook URL in dashboard configureren bij deploy
- DNS help-flow voor klanten die records niet snappen
- DPA-template + privacy-update voor sub-verwerkers (Resend / Anthropic / Supabase)

### 2026-05-01 — Filly menu-suggesties (nieuwe gerechten + Afgewezen-tab)

**Probleem dat dit oplost**: chefs willen soms een externe blik op hun
menu — een gat dat ze zelf niet zien, een seizoens-impuls, of een
gewaagd "out of the box"-idee dat hun eigen denken doorbreekt. Geen
tool die als sparring-partner werkt zonder je menu vol te stoppen.

**Migratie 0029**: nieuwe tabel `suggested_menu_items` (los van
`menu_items` zodat voorstellen niet meetellen in Filly's eigen
prompts, exports, KPI-counts tot acceptatie). Lifecycle:
pending → accepted/rejected/refined_into/expired. Lazy expire op 30
dagen voor pending, 90 dagen retention voor rejected. RLS-policy
zelfde pattern als menu_items.

**Backend** ([apps/api/src/menu-suggestions/](apps/api/src/menu-suggestions/)):
- `MenuSuggestionsService` met generate/list/accept/reject/refine.
  Sonnet 4.6 tool-use voor 3 voorstellen per batch met enum
  `confidence: high|medium|low` waarbij `low` = "Out of the box"
  (positief avontuurlijk, niet "twijfel" — Filly krijgt expliciete
  prompt-instructie hierover).
- **Daily cap**: 1× per dag per restaurant via `audit_log`-lookup
  (`action='menu_suggestions_generated'` op `>= start of UTC day`).
  Bij overschrijding: NL 400 "Filly is bewust een creatieve sparring-
  tool, geen oneindige bron".
- **Refine cap**: 3 varianten per origineel-voorstel. Refine-flow
  geeft Claude het origineel + alle eerdere varianten mee zodat 'ie
  niet hetzelfde uitspuugt.
- Accept-flow: insert in `menu_items` met midden van prijs-range,
  voorstel op `accepted` met FK naar nieuwe item. Reject = soft
  (status='rejected') — chef kan in Afgewezen-tab alsnog accepteren.

**Frontend** ([apps/web/src/app/dashboard/menu/_components/menu-suggestions-tab.tsx](apps/web/src/app/dashboard/menu/_components/menu-suggestions-tab.tsx)):
- "Voorgesteld"-tab direct na Overig in de filter-rij + "Afgewezen"-tab
  daarnaast. Beide met aantal-tellers in de label.
- Voorgesteld-tab: brand-soft banner met generate-knop, grid van
  3 kaarten met source-badge (Gat/Past/Seizoen/Variant), confidence-
  dot (groen/geel/paars-out-of-the-box), prijs-range, dietary tags,
  reasoning-blok, acties: Toevoegen aan menu / Andere variant / ✕.
- Afgewezen-tab: read-only banner ("laatste 90 dagen"), zelfde
  kaarten maar alleen "Toch toevoegen"-knop.

### 2026-05-01 — Tweede restaurant toevoegen + workspace-switcher uitgebreid

**Probleem dat dit oplost**: eigenaar met meerdere zaken
(vestigingen, 2e concept) had geen manier om vanuit een actieve
sessie een nieuwe zaak aan te maken. `OnboardingService` blokkeerde
hard met `ConflictException` als er al een `restaurant_users`-rij
bestond, en de middleware redirecte `/onboarding` direct terug naar
`/dashboard`.

**Wijzigingen**:
- `OnboardingService.completeOnboarding`: `ConflictException` weg.
  Vervangen door count-query + `is_additional_restaurant`-flag in
  audit-log + `sequence_index` zodat we kunnen herleiden hoeveelste
  zaak het is voor deze eigenaar.
- `apps/web/src/middleware.ts`: bypass `?mode=add` voor de
  "user heeft al restaurant → redirect"-regel. Bestaande gebruikers
  die per ongeluk `/onboarding` bookmarken worden nog steeds
  teruggestuurd.
- `/onboarding`-page: detecteert `mode=add` via `useSearchParams`.
  Andere kop-banner ("Nieuwe zaak toevoegen"), "Annuleren" i.p.v.
  "Uitloggen" rechtsboven, en bij succes `window.location.assign('/dashboard')`
  i.p.v. soft `router.push` zodat alle dashboard-state vers mount
  voor de nieuwe tenant (zelfde reden als bij workspace-switcher).
- Account-pagina: brand-soft banner met "+ Nieuwe zaak"-knop bovenaan
  Restaurant-sectie.
- Sidebar workspace-dropdown: "+ Nieuwe zaak toevoegen"-item, altijd
  zichtbaar (ook bij 1 restaurant).

### 2026-05-01 — Per-request Supabase-client met user-JWT (RLS defense-in-depth)

**Probleem dat dit oplost**: backend draaide op `service_role`,
wat RLS volledig bypasst. Tenant-isolatie hing alleen aan TS-guards
(`RestaurantAccessGuard` + `.eq('restaurant_id', ...)`-filters in
service-code). Eén bug of vergeten guard = potentiële cross-tenant
data-lek bij 1000+ klanten.

**Oplossing**: per HTTP-request bouwt NestJS een verse Supabase-
client met het user-JWT in de Authorization-header. PostgREST ziet
het token, draait de query als die user, en RLS-policies pakken
het via `auth.uid()`. Defense-in-depth bovenop bestaande TS-guards.

**Foundation**:
- `AuthGuard` zet `req.accessToken` na JWT-verify (was eerder
  weggegooid).
- Nieuwe `RequestSupabaseService` met `Scope.REQUEST` — leest
  `req.accessToken` lazy bij eerste `.client`-toegang en bouwt een
  Supabase-client met `global.headers.Authorization` + de
  publishable-key (sb_publishable_...).
- `SupabaseModule` exporteert beide services. NestJS scope-bubbles
  REQUEST-scope automatisch op door de provider-keten.
- Nieuwe env-var: `SUPABASE_PUBLISHABLE_KEY` (publieke "anon"-key
  in nieuwe naamgeving).

**Sweep — 13 services gemigreerd**:
- MenuService (pilot, met DB-niveau RLS-tests + browser happy-path)
- Read-heavy: Reviews, Guests, Reservations, Occupancy, Kpi
- Write-heavy: Campaigns, Suggestions, Chat, ChatMemory, Restaurant,
  DataExport, Weather
- AI-context: RestaurantContextService

**Bewust op `SupabaseService` (service_role) gebleven**:
- `AuditLogService` — audit moet altijd schrijven, ook bij blokkade
- `AnonymizationService` — background-flow, geen user-context
- `AccountDeletionService` — verwijdert auth.users, vereist admin
- `OnboardingService` — creëert restaurant vóór `restaurant_users`-link
- `AiService` (alleen `ai_usage`-logging) — kan null restaurant_id
  bij pre-onboarding
- `TeamService` — gebruikt `auth.admin.inviteUserByEmail` +
  `generateLink`, vereist admin-API-toegang
- `AiRateLimitGuard` — kan pre-auth draaien

**Validatie via 4 RLS-tests met tijdelijke testgebruiker** (zelf
opgezet via Admin API + cleanup):
- Cross-tenant SELECT → `[]` ✅
- Eigen tenant SELECT → 3 gerechten ✅
- SELECT zonder filter → alleen rijen van eigen restaurant_id ✅
- Cross-tenant INSERT → **HTTP 403** + `new row violates row-level
  security policy for table "menu_items"` ✅

Plus browser-rooktest op alle 10 dashboard-pagina's groen.

### 2026-05-01 — Publieke marketing-site herbouw + dashboard-redesign

**Publieke site (commit `e1789ed`)**: alle 4 marketing-pagina's
(home/product/pricing/about) overgezet naar het Claude Design-prototype.
`apps/web/src/app/landing.css` is een 1-op-1 kopie van het design's
`styles.css` (zonder body/navbar/footer-overrides die met
dashboard/auth zouden conflicteren). Bij toekomstige design-update:
file overschrijven, niet handmatig vertalen — voorkomt kleur/vorm-
afwijkingen die we zagen tijdens de eerste poging.

**Dashboard layout-pas (commits `7598270`, `e27a8b9`)**:
- Weersvoorspelling weg uit UI (component verwijderd 2026-05-01).
  Backend `WeatherService` blijft draaien voor Filly's chat-context.
- "Campagnes deze maand"-DetailCard naast kalender weg (component
  verwijderd 2026-05-01).
- Sidebar herkleurd: van donkergroen naar wit met groen-soft active-
  pill — match met de mini-dashboard mockup van de landingspagina.
- Workspace-dropdown wit i.p.v. papier-warm.
- Kalender-cellen krijgen heatmap-bg op basis van occupancy-tier
  (rood < 40%, koper midden, groen 80%+); tekst altijd zwart;
  vandaag = groene outline-ring i.p.v. pill rond dag-nummer.
- Campagne-emoji's (✉️/📱/💬) per cel i.p.v. gekleurde stippen.
- Dag-view: nieuwe uur-staafdiagram 11:00-22:00 (mock data tot een
  `/occupancy/hours`-endpoint via reserveringsplatform-integraties).
- Week-view: nieuw tussen Dag en Maand — 7 staven Ma-Zo met dezelfde
  fallback-keten als de maand-view (`seededOccupancy`) zodat
  percentages tussen views identiek zijn.
- Jaar-view: cellen vullen volle hoogte van de card.
- KPI-onderregels donkergroen, alert-bar rood (was geel).

**Campagnes-pagina (commit `f209e86`)**:
- Verlopen-tab toegevoegd naast Open/Afgewezen, met frontend-detectie
  via `target_date` in `trigger_context`. Drie tabs altijd zichtbaar.
- Verlopen-kaart: gedimd, alleen Details-actie (niet meer goedkeurbaar).
- Afgewezen-kaart: impact-blok grijs i.p.v. groen — niet meer alsof
  de impact nog gaat komen.
- Voorstellen-grid: `minmax(380px, 1fr)` zodat kaarten breedte vullen.
- Internal scroll op Voorstellen-strip + Overige acties (max-height
  + overflow-y: auto), zelfde grid-breedte zodat ze uitlijnen.
- Drie subkoppen (Voorstellen van Filly / Overige acties / Campagnes)
  uniform: zwart, fontSize 15, geen ✨-emoji meer.
- WhatsApp-detail: Inhoud-card + Foto-card naast elkaar in 2-koloms
  grid (1fr + 320px), default grid-stretch zodat onderkanten gelijk
  uitlijnen.
- Witregel-fix: `landing.css` definieert globaal
  `section { padding: 112px 24px }` — dat lekte door naar het
  dashboard. Override in `dashboard.css`: `.dashboard-shell section
  { padding: 0 }`.

**Opruim 2026-05-01**: WeatherForecast + DetailCard components verwijderd,
bijhorende CSS (`.weather-row`, `.weather-day`, `.det-*`,
`.detail-campaigns`, `.pg/.po/.pr`) opgeruimd. `occupancyClass`-helper
weg (vervangen door tier-classes op cell-niveau).

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
