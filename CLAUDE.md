# Get-Filly — Claude Code context

Dit bestand wordt automatisch door Claude Code geladen. Lees het als je in deze repo werkt.

## Belangrijk: eerst dit doen

**Open altijd eerst [BACKLOG.md](BACKLOG.md)** — dat is dé lijst met
openstaande punten (P0-P3), bekende mocks, ontbrekende migraties en
alle niet-gefixte issues. Werk die file bij als je iets afmaakt of
nieuwe punten tegenkomt.

## Wat het is
AI-gedreven marketing- en bezettings-dashboard voor Nederlandse horecaondernemers. SaaS met Filly als AI-marketingassistent die namens de zaak reviews beantwoordt, campagnes voorstelt en via chat meedenkt over marketing-acties.

## Stack
- **Frontend**: Next.js 16 App Router (Turbopack) — `apps/web/`
- **Backend**: Nest.js — `apps/api/`
- **Data**: Supabase (Postgres + Auth + Storage), geen ORM — Supabase JS SDK direct
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` — centrale wrapper in `apps/api/src/ai/`
- **Monorepo**: pnpm workspaces
- **Styling**: custom CSS-variabelen. Huisstijl = **papier-warm (#FAF7F1) + British Racing Green (#1F4A2D)**. Inter font. 8px radii.
- **Weer-API**: Open-Meteo (gratis)

## Structuur
```
apps/
  web/
    src/
      app/
        (publieke site: home, product, pricing, about, login, signup, invite/accept, auth/confirm)
        dashboard/
          (campagnes[/id], reserveringen, gasten, reviews, menu, rapportages, koppelingen, account[/team])
          (legacy-routes, niet meer in sidebar: taken/, suggesties/ — detail-views + fallback-links)
          _components/  (sidebar, topbar, kpi-row, filly-chat, tasks-strip, suggestion-detail-modal, skeleton, access-guard, …)
      components/navbar.tsx
      lib/
        api.ts              (authedFetch + alle backend-calls)
        restaurant-context.tsx  (actieve restaurant in localStorage)
        supabase-{browser,server}.ts
      middleware.ts         (auth-guard: redirect naar /login)
  api/
    src/
      common/               (auth.guard, restaurant-access.guard, ai-rate-limit.guard + decorators)
      ai/                   (ai.service centrale Claude-wrapper + restaurant-context.service)
      chat/                 (Filly-chat: dashboard-home assistent)
      {campaigns,guests,kpi,occupancy,restaurant,weather,suggestions,menu,reservations,reviews,me,team}/
      supabase/
    supabase/migrations/    (SQL 0001-0016, handmatig runnen in Supabase SQL Editor)
packages/
  shared/                   (gedeelde TypeScript types + DEFAULT_PERMISSIONS per rol)
```

## Workflow-voorkeuren
- **Taal**: Nederlands
- **Stapsgewijs werken** — kleine stappen, vragen stellen vóór grote acties
- **Commentaar in code** mag uitleggend zijn (Floris leert door te lezen)
- **Git-commits na elke fase**, niet opsparen
- **`pnpm dev`** start web op :3000 en api op :3001

## Conventies
- **Multi-tenant**: alle restaurant-gescopete controllers onder `@UseGuards(AuthGuard, RestaurantAccessGuard)`. `X-Restaurant-Id` header is verplicht, géén fallback-id. Queries dubbel scopen op `(entity_id + restaurant_id)` = defense-in-depth.
- **AI-calls**: altijd via `AiService.generateText({ meta: { restaurantId, userId, feature } })`. TypeScript dwingt tracking af. Rate-limit via `AiRateLimitGuard` op elk endpoint dat Claude aanroept.
- **Frontend fetch**: via `authedFetch` in `src/lib/api.ts` — stuurt JWT + X-Restaurant-Id automatisch.
- **Seed-restaurant-id**: `00000000-0000-0000-0000-000000000001` (Bistro Get-Filly).
- **Tweede test-restaurant**: `00000000-0000-0000-0000-000000000002` (Cafe Get-Filly, handmatig aangemaakt via seed-snippet).
- **`.env`-bestanden** in `apps/{web,api}/` — niet in Git, wel vereist voor dev. Zie `.env.example` per app.

## Wat er draait / status (2026-04-25, einde dag)

**UI + backend**: dashboard + publieke site werken met echte data uit Supabase. Middleware-auth actief. Multi-tenant met auth-guards + rol-filter + team-invite-flow live.

**Auth + onboarding live**:
- Signup + login + logout (email/password, Supabase Auth)
- Password-reset via `/forgot-password` + `/reset-password` (gebruikt `/auth/confirm`-SSR-route)
- Sterk-wachtwoord-UI: `<PasswordStrength>` met live 4-checks op signup én reset
- 3-stappen onboarding-wizard op `/onboarding` voor nieuwe users (middleware-redirect op dashboard-bezoek zonder restaurant)
- **Geocoding live**: onboarding-flow zet adres → lat/long via PDOK Locatieserver (Kadaster, gratis, EU, geen API-key). Fail-soft.
- Supabase email-templates beheer via `pnpm supabase:apply-templates` (Management API-script, geen handwerk)

**Filly AI live**:
- Review-reply-suggesties (Claude Sonnet 4.6, 3-varianten-kiezer)
- Filly-chat op dashboard-home met persistente historie + live restaurant-context (weer/bezetting/reserveringen)
- **Chat → campagne-actie**: Filly kan in chat een campagne voorstellen (machine-blok `<<FILLY_PROPOSE_CAMPAIGN>>`). Proposal-card met "Ja, maak aan / Nee, bedankt". Lineage via ai_suggestions → campaigns FK.
- **Website-analyzer**: crawl homepage + Claude-extractie van heel profiel.
- **Menu-importer**: Claude Opus 4.7 Vision op PDF/JPG/PNG — extraheert gerechten + prijzen + categorieën + allergenen (kolom toegevoegd in migratie 0013).
- **Suggestion-refine**: `POST /api/suggestions/:id/refine` laat Filly pending-voorstel aanpassen op instructie van eigenaar ("maak huiselijker", "korter"). Gebruikt in SuggestionDetailModal met side-chat.
- **Chat-proposal genereert 3 varianten**: prompt-update, modal toont 3 kaarten naast elkaar, user kiest favoriet via `selectVariant`-endpoint. Refine herschrijft alleen geselecteerde variant.
- **Campagne-refine** met cache (migratie 0014): `POST /campaigns/:id/refine` genereert 3 alternatieven + cachet in `filly_variants` jsonb. Max 2 generaties (3 + 3 = 6 versies). PATCH op body wist cache + reset count zodat varianten matchen met nieuwe inhoud.
- **Review-reply-varianten** met zelfde cache-patroon: 3 vooraf, 1× regenerate, lock op 6.
- **Schedule-suggestion**: `POST /campaigns/:id/suggest-schedule` met cache, leest type + restaurant-context, returnt datetime + reasoning.
- Usage-tracking in `ai_usage`-tabel (nullable `restaurant_id` voor pre-onboarding calls), rate-limit 100/uur/restaurant + pre-onboarding in-memory limit

**/dashboard/campagnes is nu dé hub**:
- Voorstellen-strip bovenaan (auto-gegenereerd + chat-voorstellen samen; tabs Open/Afgewezen met Terugzetten-knop)
- Overige acties (TasksStrip): reviews-zonder-reactie, lage bezetting, grote reserveringen, verjaardagen — met filter "Actie vereist (high+medium)" / "Alle" en scroll-container (max 320px)
- Campagnes-tabel daaronder (concept/ingepland/actief/afgerond + filters + zoek + **quick-actions kolom** per status: Inplannen/Verwijder/Activeer/Stop/Archiveer)
- Concept-campagnes bewerkbaar via detail-page ("✎ Bewerken"-knop, PATCH-endpoint)
- **"✨ Met Filly bewerken"-paneel** op detail-page: 3 alternatieven server-side gecached (DB), 1× extra regenerate-knop = 6 totaal max, daarna lock voor kostenbeheersing.
- **Foto-upload** op social/whatsapp concept-campagnes (Supabase Storage `campaign-media`, signed URLs, 10MB cap, drag-and-drop). WhatsApp-foto in aparte card; social-foto in Instagram-preview.
- **"📅 Wanneer plaatsen?"-card** met Filly's tijdstipsuggestie: type-specifieke regels (mail 9-10:30/19:30-20:30, social 17-20, whatsapp 18-20:30), reasoning meegeleverd. Eigenaar accepteert / wijzigt zelf / vraagt andere suggestie.
- "Suggesties" en "Taken" zijn uit de sidebar verwijderd; routes bestaan nog als legacy

**Reserveringen**:
- Handmatige invoer via modal (naam + datum + tijd + groep verplicht, rest optioneel)
- Filter op status + zoek op naam/telefoon/mail
- "Via Filly"-badge consistent met gasten-pagina

**Gasten**:
- "Via Filly" als prominente eerste kolom met groene "✓ Ja"-badge

**Legal (concept-v1)**:
- `/privacy` en `/voorwaarden` live met gele draft-banner
- Alle AVG-secties ingevuld op basis van stack (Supabase/Anthropic/Resend/Vercel/Mollie)
- `[INVULLEN:...]`-placeholders voor bedrijfsgegevens — wacht op Floris voor invullen
- Jurist-review als P0 in BACKLOG

**Mock nog steeds** (zie BACKLOG.md P2-sectie):
- Menu-upload via menu-pagina (onboarding-upload werkt wel al, maar menu-pagina zelf laat alleen GET zien)
- Menu CRUD-endpoints (POST/PATCH/DELETE nog niet gebouwd)
- Campagne-send engine (Resend ontbreekt)
- **Meta (Facebook/Instagram): code-kant af** (2026-06-06) — verbinden + versleutelde token-opslag + deauthorize/data-deletion-callbacks + publiceren (FB/IG). Wacht op Meta App Review + business-verificatie; zie BACKLOG "Integraties (OAuth)".
- Overige externe integraties (Google Business, Zenchef, etc.) nog mock

**Live op Vercel** (bijgewerkt 2026-06-05): zowel web (Next.js) als api
(Nest.js, serverless functions, regio `fra1` — zie `apps/api/vercel.json`)
draaien in productie via Vercel. Deploy gaat automatisch bij een push naar
`main`. **Canoniek domein: `https://www.get-filly.com`** (apex `get-filly.com`
hoort 301 → www; instellen in Vercel → Domains). De `railway.json` is legacy
en kan vermoedelijk weg. Lokaal draaien (`pnpm dev`) werkt nog steeds voor
ontwikkeling, maar Floris werkt rechtstreeks tegen de live-omgeving.

**SEO live** (2026-06-05): per-pagina metadata, `sitemap.ts`, `robots.ts`,
JSON-LD (Organization/WebSite/SoftwareApplication) en gegenereerde OG-image.
Centrale config in `apps/web/src/config/seo.ts` (`SITE_URL` = canoniek domein).
Nog te doen: apex→www 301 in Vercel + Google Search Console + sitemap indienen.

**Belangrijke dev-toggle**: email-confirmation staat **UIT** in Supabase (dev-bypass). **Terug AAN zetten voordat er productie-klanten op komen** — staat als ⚠️ in BACKLOG P0.

## Handmatige Supabase-config (niet in migraties)

Zie [`docs/supabase-manual-setup.md`](docs/supabase-manual-setup.md)
voor email-templates, redirect-URLs en test-data die handmatig zijn
ingesteld en bij een schone Supabase-project-reset opnieuw moeten.
