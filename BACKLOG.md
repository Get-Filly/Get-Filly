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
- [ ] **Empty-states-sweep dashboard** — alle dashboard-pagina's tonen nu een rode "HTTP 403/500" bij ontbrekende data. Moet worden: "Nog geen reserveringen deze maand" / "Je hebt nog geen campagnes, begin een campagne →". Per pagina pass maken.
- [x] ~~Signup → auto-restaurant-creatie~~ — `/onboarding`-wizard live (2026-04-24, commit `5d888c9`)
- [x] ~~Password-reset flow~~ — `/forgot-password` + `/reset-password` live (2026-04-24, commit `335f5a1`)
- [x] ~~Wachtwoord-eisen + confirmatie-veld~~ — signup en reset-password gebruiken herbruikbaar `<PasswordStrength>` component met live checklist (8+ tekens, letter, cijfer, speciaal teken). Submit disabled tot groen (2026-04-24, commit `15fe843`).
- [x] ~~Supabase email-templates geautomatiseerd~~ — `pnpm supabase:apply-templates` PATCHt alle 4 templates (invite, magic-link, recovery, confirmation) via Management API. Geen handwerk meer in dashboard. (2026-04-24, commit `2775f08`)
- [x] ~~Onboarding met Filly-auto-invul~~ — URL + menukaart → Filly vult hele profiel in (description, tagline, atmosphere, target_audience, USPs, events, signature_dishes, cuisine_style, adres, toon) + menu-items via Opus Vision. Wizard: bronnen → review → bevestig (2026-04-24, commits `b29f317` + `d909c65`).

### Legal & compliance (AVG/NL)
- [~] **Privacy-verklaring** — `/privacy` concept-v1 live (2026-04-24). Nog te doen: (1) bedrijfsgegevens invullen (`[INVULLEN:...]`-placeholders op de pagina), (2) jurist-review, (3) gele draft-banner weghalen.
- [~] **Algemene voorwaarden** — `/voorwaarden` concept-v1 live (2026-04-24). Nog te doen: (1) bedrijfsgegevens + rechtbank + aansprakelijkheidsmax invullen, (2) jurist-review, (3) draft-banner weghalen, (4) aparte verwerkersovereenkomst opstellen (wordt in de AV naar verwezen).
- [ ] **Jurist-review legal-teksten** — laten reviewen door privacy/SaaS-jurist vóór eerste klant. Met name: aansprakelijkheidslimiet, SLA-claim, IP-clausule AI-output, prijswijzigings-clausule.
- [ ] **Cookie-banner** — ePrivacy-verplicht zodra Plausible/PostHog erop komt. Concept-privacy verwijst nu al vooruit naar banner.
- [ ] **AVG-endpoints** — data-export + right-to-be-forgotten (account-delete). Zie ook data-classificatie-item hieronder.
- [ ] **Data-classificatie + anonimisering-bij-delete** — groter dan de regel hierboven. Elke tabel categoriseren: (1) identificerend → harde delete, (2) business-signaal → anonimiseren + bewaren voor AI-benchmarking, (3) aggregaat → blijft. Plan: eerst `docs/data-classification.md` maken met per-tabel-categorie + PII-velden. Dán techniek kiezen (`anon_*`-tabellen vs soft-delete-mask vs hybride). Waarom belangrijk: geanonimiseerde patronen ("pizza margherita €12,50 werkte in italiaanse zaken in NH") zijn onze AI-leer-schat, maar restaurant_id+naam+foto's moeten juridisch weg. Niet blokkerend voor eerste klant, wél vóór tweede deletion.

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
- [ ] **Suggesties-generator** — `getMockProposal()` in [suggesties/page.tsx](apps/web/src/app/dashboard/suggesties/page.tsx) vervangen door Claude-call met `RestaurantContextService` + menu_items. Grote overlap met chat v2.
- [ ] **Menu CRUD endpoints** — POST/PATCH/DELETE op `/api/menu`. Nu alleen GET; frontend houdt wijzigingen in local state. Opnieuw uploaden menukaart via menu-pagina (met Storage-opslag) ook hier.
- [ ] **Prompt caching activeren** — `cache_control: { type: 'ephemeral' }` op system-prompts zodra die stabiel >1024 tokens zijn (chat v2 zit waarschijnlijk al zo hoog).
- [ ] **Auto-title-generation voor chat-conversations** — `chat_conversations.title` blijft nu null.

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
- [ ] **`FILLY_MOCK`** in [kpi-row.tsx:27](apps/web/src/app/dashboard/_components/kpi-row.tsx) — KPI-subregels "door Filly"
- [ ] **`isFromFilly()`** — deterministische hash in reserveringen + gasten
- [ ] **`FILLY_ROI_6M` + `FILLY_BY_TYPE`** in rapportages-pagina
- [x] ~~`buildFillyReply()` in reviews~~ — vervangen door echte Claude-call (2026-04-23)
- [x] ~~`MOCK_RECOGNIZED` in menu-pagina~~ — vervangen door echte Vision-analyse tijdens onboarding (menu-pagina zelf is volgende stap)
- [ ] **`cardItemIds`-set in memory** in menu-pagina
- [ ] **Statische koppelingen-lijst** zonder OAuth-flow

### Database-migraties nog te maken
- [x] ~~`menu_uploads` + Storage-bucket + FK menu_items.menu_upload_id~~ (migratie 0011, 2026-04-24)
- [x] ~~ai_usage.restaurant_id nullable (pre-onboarding logging)~~ (migratie 0012, 2026-04-24)
- [x] ~~restaurants.website_url + onboarded_at~~ (migratie 0010, 2026-04-24)
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
- [x] ~~3-stappen wizard met Filly-auto-invul~~ (2026-04-24)
- [ ] **Sample-data toggle** — demo-data voor nieuwe accounts die geen website/menu hebben
- [ ] **Setup-checklist** op dashboard tot alles klaar staat (reviews koppelen, socials, team, etc.)

---

## Test-data & seeds

- [x] ~~`apps/api/supabase/seeds/test_restaurants.sql`~~ — exacte inhoud uit Supabase gekopieerd (commit `699c84b`).
- [ ] **Mock-chat-berichten uit 0001-seed opruimen** — momenteel zien we die donderdag/38% demo-conversatie op het dashboard van Bistro Get-Filly.
- [x] ~~`test_campaigns.sql`~~ — niet nodig (bleek duplicaat van migratie 0005).

---

## Bekende kleine bugs / TODO-markers in code

Grep periodiek op `TODO`, `FIXME`, `MOCK`, `mock` in `apps/` om bij te
werken. Laatste audit: 2026-04-23.

- [ ] `/apps/web/src/app/dashboard/_components/filly-chat.tsx` — oud comment "Mock-antwoord. Later vervangen door echte Claude API call" is niet meer relevant sinds commit `53db975` maar de file-structuur verdient een review-pass.
- [ ] `/apps/web/src/app/dashboard/account/page.tsx` — bevat nog "Komt beschikbaar zodra de Claude API gekoppeld is"-melding die nu niet meer klopt.
- [ ] Next.js warning `"middleware" file convention is deprecated; use "proxy" instead` — cosmetisch, te fixen door file te hernoemen naar `proxy.ts` bij een volgende pass.

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

## Recent voltooid

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
