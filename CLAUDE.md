# Get-Filly — Claude Code context

Dit bestand wordt automatisch door Claude Code geladen. Lees het als je in deze
repo werkt.

## Eerst dit

1. **[BACKLOG.md](BACKLOG.md)** — alles wat nog open staat (P0–P3), bekende
   mocks en niet-gefixte issues. Werk die lijst bij als je iets afmaakt of iets
   nieuws tegenkomt. Opent met "Vóór externe testers — de korte lijst".
2. **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — wat er wanneer gebouwd is en
   waarom de keuzes zo vielen. Zoek hier als je je afvraagt waarom iets is zoals
   het is.
3. **[docs/overdracht-2026-09-16.md](docs/overdracht-2026-09-16.md)** — de
   laatste grote sessie, inclusief twee incidenten en wat daaruit te leren valt.

## Wat het is

**AI-capaciteitoptimalisator voor lokale ondernemers** (multi-branche: horeca,
wellness, kappers, sportscholen, recreatie — niet meer horeca-only). SaaS met
Filly als AI-assistent die rustige momenten detecteert en, met goedkeuring van
de ondernemer, de juiste actie inzet (campagnes, reviews, vindbaarheid) om lege
capaciteit te vullen.

"Get-Filly" = het bedrijf, "Filly" = de assistent. Die scheiding geldt ook in de
teksten: marketingcopy zegt Get-Filly, de chat en de mockups zeggen Filly.

## Stack

- **Frontend**: Next.js 16 App Router (Turbopack) — `apps/web/`, NL/EN via
  `[locale]`-segment
- **Backend**: Nest.js — `apps/api/`, op Vercel als serverless functions (`fra1`)
- **Data**: Supabase (Postgres + Auth + Storage), geen ORM — Supabase JS SDK direct
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` — centrale wrapper in `apps/api/src/ai/`
- **Monorepo**: pnpm workspaces. `pnpm dev` start web op :3000 en api op :3001
- **Styling**: custom CSS-variabelen. Papier-warm (#FAF7F1) + British Racing
  Green (#1F4A2D), Inter, 8px radii
- **Extern**: Open-Meteo (weer), Apify (Google populaire tijden), PDOK (geocoding),
  Resend (transactionele mail), Meta / Google Bedrijfsprofiel / TikTok (publiceren)

**Live**: web + api draaien op Vercel, deploy gaat automatisch bij een push naar
`main`. Canoniek domein `https://www.get-filly.com` (apex redirect 308 → www via
`next.config.ts`).

## Structuur

```
apps/
  web/src/
    app/[locale]/           publieke site (home, product, pricing, about, blog,
                            contact, legal) + auth-schermen + onboarding
      dashboard/            campagnes[/id], gasten, reviews, menu, rapportages,
                            koppelingen, google-business, marketing, account
        _components/        sidebar, topbar, filly-chat, kpi-row, …
      proto-*/              prototypes, publiek bereikbaar maar uit de zoekindex
    lib/                    api.ts (authedFetch), business-context.tsx,
                            quiet-reason.ts, supabase-{browser,server}.ts
    middleware.ts           auth-guard: redirect naar /login
  api/src/
    common/                 auth.guard, business-access.guard, rate-limit.guard,
                            ai-rate-limit.guard, token-crypto, decorators
    ai/                     ai.service (centrale Claude-wrapper), filly-brain.config,
                            industry/ (branche-packs)
    busyness/               rustige momenten: detectie, signalen, terugkoppeling
    campaigns/ chat/ reviews/ menu/ guests/ team/ meta/ tiktok/ google-business/ …
    supabase/migrations/    SQL 0001–0077, handmatig runnen in de SQL Editor
packages/shared/            gedeelde types + DEFAULT_PERMISSIONS per rol
```

## Conventies

- **Multi-tenant**: elke business-gescopete controller onder
  `@UseGuards(AuthGuard, BusinessAccessGuard)`. De header `X-Business-Id` is
  verplicht, géén fallback-id. Queries dubbel scopen op
  `(entity_id + business_id)` — defense-in-depth.
- **Renames uit mig 0068**: `restaurants`→`businesses`,
  `restaurant_id`→`business_id`, `X-Restaurant-Id`→`X-Business-Id`,
  `RestaurantAccessGuard`→`BusinessAccessGuard`. Let bij zulke renames op de
  PostgREST-embed/cast-valkuil: geforceerde as-casts omzeilen `tsc` en geven pas
  op productie "Geen toegang".
- **AI-calls**: altijd via
  `AiService.generateText({ meta: { restaurantId, userId, feature } })`.
  Het veld heet intern nog `restaurantId` maar bevat een business-id.
  TypeScript dwingt de tracking af. Rate-limit via `AiRateLimitGuard` op elk
  endpoint dat Claude aanroept.
- **Frontend fetch**: via `authedFetch` in `src/lib/api.ts` — stuurt JWT +
  `X-Business-Id` automatisch mee.
- **Branche**: elke zaak heeft een `industry` (mig 0066); Filly's brein leest een
  branche-pack uit `apps/api/src/ai/industry/`. Horeca-gedrag is byte-identiek
  gebleven; andere branches erven een generieke pack + VAKTAAL-blok.
- **Test-ids**: `00000000-0000-0000-0000-000000000001` (Bistro Get-Filly),
  `…0002` (Cafe Get-Filly).
- **`.env`** in `apps/{web,api}/` — niet in Git, wel vereist voor dev. Zie
  `.env.example` per app.

## Werkafspraken

- **Nederlands.** Commentaar in de code mag uitleggend zijn — Floris leest mee om
  te leren.
- **`main` deployt automatisch naar productie.** Altijd op een feature-branch
  werken, pas mergen na expliciet akkoord. Controleer `git status` vóór een merge:
  er kan ongecommit werk in de tree staan dat apart moet blijven.
- **Migraties draait Floris handmatig.** Plak de volledige SQL inline in de chat,
  niet alleen een verwijzing naar het bestand, en merge pas nadat hij zegt dat
  'ie gedraaid is.
- **UI-wijzigingen eerst als prototype** op localhost laten zien, pas bouwen na
  akkoord.
- **Kleine stappen, commit per fase**, niet opsparen.

## Twee dingen die eerder zijn misgegaan

- **Start de API echt op na elke module-wijziging** (`node dist/main.js`, kijk of
  "successfully started" komt). `tsc`, `eslint`, `jest` en `nest build` starten
  de DI-container geen van alle op — een module die zichzelf niet kan laden is
  voor alle vier onzichtbaar. Zo lag de productie-API een keer uren plat.
- **"Groen" is niet hetzelfde als "het werkt".** Meet aan de verandering die je
  hebt aangebracht, niet aan een signaal dat er toevallig naast ligt. Een 401 op
  een beveiligd endpoint bewijst dat er íets draait, niet dat het jouw build is.

## ⚠️ Staat nog open

**E-mailbevestiging staat UIT in Supabase** (dev-bypass). Moet aan vóór er
mensen van buiten op komen — zie de korte lijst bovenaan `BACKLOG.md`.

## Documentatie

| Map | Wat erin staat |
|---|---|
| [`docs/werking/`](docs/werking/) | hoe het werkt: rustige-momenten-detectie, Filly's brein, health-score, social-posting, database-schema |
| [`docs/setup/`](docs/setup/) | wat je handmatig moet doen: Supabase-config, CRM-koppeling, OAuth-verificatie |
| [`docs/legal/`](docs/legal/) | verwerkersovereenkomst (template, wacht op jurist) |
| [`docs/archief/`](docs/archief/) | afgerond of nooit uitgevoerd — elk bestand zegt bovenaan welke van de twee |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | wat er wanneer gebouwd is |
