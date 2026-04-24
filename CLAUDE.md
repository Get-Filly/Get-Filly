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
          (taken, suggesties, reserveringen, campagnes[/id], gasten, reviews, menu, rapportages, koppelingen, account[/team])
          _components/  (sidebar, topbar, kpi-row, filly-chat, skeleton, access-guard, placeholder-page, …)
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
    supabase/migrations/    (SQL 0001-0009, handmatig runnen in Supabase SQL Editor)
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

## Wat er draait / status (2026-04-24)

**UI + backend**: 11 dashboard-pagina's + publieke site werken met echte data uit Supabase. Middleware-auth actief. Multi-tenant met auth-guards + rol-filter + team-invite-flow live.

**Auth + onboarding live**:
- Signup + login + logout (email/password, Supabase Auth)
- Password-reset via `/forgot-password` + `/reset-password` (gebruikt `/auth/confirm`-SSR-route)
- Sterk-wachtwoord-UI: `<PasswordStrength>` met live 4-checks op signup én reset
- 3-stappen onboarding-wizard op `/onboarding` voor nieuwe users (middleware-redirect op dashboard-bezoek zonder restaurant)
- Supabase email-templates beheer via `pnpm supabase:apply-templates` (Management API-script, geen handwerk)

**Filly AI live**:
- Review-reply-suggesties (Claude Sonnet 4.6, 3-varianten-kiezer)
- Filly-chat op dashboard-home met persistente historie + live restaurant-context (weer/bezetting/reserveringen)
- **Website-analyzer**: crawl homepage + subpagina's + Claude Sonnet-extractie van hele profiel (tagline, atmosphere, target_audience, USPs, signature_dishes, cuisine_style, website_summary, social_media)
- **Menu-importer**: Claude Opus 4.7 Vision op geüploade PDF/JPG/PNG — extraheert gerechten + prijzen + categorieën + allergenen. Test met Bisous-kaart (403KB PDF): 54 gerechten foutloos ingelezen.
- Usage-tracking in `ai_usage`-tabel (nu met nullable `restaurant_id` voor pre-onboarding calls), rate-limit 100/uur/restaurant + pre-onboarding in-memory limit

**Mock nog steeds** (zie BACKLOG.md P2-sectie):
- Suggesties-generator (huidige Filly-voorstellen in UI zijn nog `getMockProposal()`)
- Menu-upload via menu-pagina (onboarding-upload werkt wel al, maar menu-pagina zelf laat alleen GET zien)
- Menu CRUD-endpoints (POST/PATCH/DELETE nog niet gebouwd)
- Campagne-send engine (Resend ontbreekt)
- Alle externe integraties (Meta, Google Business, Zenchef, etc.)

**Niet gedeployed** — draait lokaal. Vercel/Railway-config komt bij P1-werk (zie BACKLOG.md).

**Belangrijke dev-toggle**: email-confirmation staat **UIT** in Supabase (dev-bypass). **Terug AAN zetten voordat er productie-klanten op komen** — staat als ⚠️ in BACKLOG P0.

## Handmatige Supabase-config (niet in migraties)

Zie [`docs/supabase-manual-setup.md`](docs/supabase-manual-setup.md)
voor email-templates, redirect-URLs en test-data die handmatig zijn
ingesteld en bij een schone Supabase-project-reset opnieuw moeten.
