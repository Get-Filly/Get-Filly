# Get-Filly — Claude Code context

Dit bestand wordt automatisch door Claude Code geladen. Lees het als je in deze repo werkt.

## Wat het is
AI-gedreven marketing- en bezettings-dashboard voor Nederlandse horecaondernemers. SaaS met Filly als AI-marketingmanager.

## Stack
- **Frontend**: Next.js 16 App Router (Turbopack) — `apps/web/`
- **Backend**: Nest.js — `apps/api/`
- **Data**: Supabase (Postgres + Auth + Storage), geen ORM — Supabase JS SDK direct
- **Monorepo**: pnpm workspaces
- **Styling**: custom CSS-variabelen (Linear-inspired: zwart accent, puur wit, 8px radii, Inter font). Geen Tailwind utilities actief gebruikt.
- **Weer-API**: Open-Meteo (gratis)

## Structuur
```
apps/
  web/
    src/
      app/
        (publieke site: home, product, pricing, about, login, signup)
        dashboard/
          (taken, suggesties, reserveringen, campagnes[/id], gasten, reviews, menu, rapportages, koppelingen, account)
          _components/  (sidebar, topbar, kpi-row, calendar-card, detail-card, chart-card, filly-chat, skeleton, placeholder-page)
          _lib/  (calendar-data, chart-data, month-campaigns)
          dashboard.css
      components/navbar.tsx  (publieke navbar)
      lib/
        api.ts              (alle fetch-calls naar backend)
        supabase.ts         (service key, niet client)
        supabase-browser.ts (browser client voor auth)
        supabase-server.ts  (server client voor middleware)
      middleware.ts         (auth-guard: redirect naar /login)
  api/
    src/
      common/restaurant-id.decorator.ts  (multi-tenancy via @RestaurantId())
      {campaigns,guests,kpi,occupancy,restaurant,weather,suggestions,menu,reservations,reviews}/
      supabase/
    supabase/migrations/  (SQL-migraties 0001-0005, handmatig runnen in Supabase SQL Editor)
```

## Workflow-voorkeuren
- **Taal**: Nederlands
- **Stapsgewijs werken** — kleine stappen, vragen stellen vóór grote acties
- **Git-commits** na elke fase
- **Plakken in chat** i.p.v. Terminal-commando's als het kan
- **`pnpm dev`** start web op :3000 en api op :3001

## Conventies
- Backend-services nemen `restaurantId` als parameter (niet hardcoded). Controllers gebruiken `@RestaurantId()` decorator die de `X-Restaurant-Id` header leest of fallback naar demo-id.
- Frontend gebruikt `fetch` via `src/lib/api.ts`.
- Seed-restaurant-id is `00000000-0000-0000-0000-000000000001` (Bistro Get-Filly).
- `.env`-bestanden staan in `apps/{web,api}/` — niet in Git, wel vereist voor dev.

## Wat er draait / status
Zie `~/Documents/6. Claude/5. Get-Filly/Get-Filly/PROJECT/tech/architecture/stack.md` voor complete status.

Samengevat: alle 11 dashboard-pagina's + publieke site werken met echte data uit Supabase. Middleware-auth actief. Weer-integratie via Open-Meteo live. Claude API voor Filly nog niet geïntegreerd (chat is mock). Externe koppelingen nog niet gebouwd. Niet gedeployed.

## Wat Floris uitgesteld heeft
- Claude API voor Filly (te doen: API-key + Anthropic SDK)
- Deploy naar Vercel/Railway
- Externe integraties (POS, Meta, Google Business, reserveringsplatformen)
- Mobile responsive pass
