# Get-Filly

**AI-capaciteitoptimalisator voor lokale ondernemers.** Filly ziet wanneer een
zaak rustig wordt en zet, met goedkeuring van de ondernemer, de juiste actie in
om die lege capaciteit te vullen: een campagne, een reactie op reviews, een
zetje voor de vindbaarheid. Voor horeca, wellness, kappers, sportscholen en
recreatie.

Live op [www.get-filly.com](https://www.get-filly.com).

## Ontwikkelen

```bash
pnpm install
pnpm dev
```

Frontend op `http://localhost:3000`, backend op `http://localhost:3001`. Los
starten kan met `pnpm dev:web` en `pnpm dev:api`.

Je hebt een `.env` nodig in `apps/web/` en `apps/api/` — zie de `.env.example`
per app. Die bestanden staan niet in Git.

## Structuur

| | |
|---|---|
| [`apps/web/`](apps/web/) | Next.js 16 — publieke site + dashboard, tweetalig NL/EN |
| [`apps/api/`](apps/api/) | Nest.js — API, Claude-integratie, koppelingen |
| [`packages/shared/`](packages/shared/) | gedeelde types + rechten per rol |

Data staat in Supabase (Postgres, Auth, Storage), zonder ORM. Migraties worden
handmatig gedraaid in de SQL Editor; ze staan in
`apps/api/supabase/migrations/`.

## Documentatie

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | projectcontext: stack, conventies, werkafspraken |
| [`BACKLOG.md`](BACKLOG.md) | alles wat nog open staat |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | wat er wanneer gebouwd is, en waarom zo |
| [`docs/werking/`](docs/werking/) | hoe de onderdelen werken |
| [`docs/setup/`](docs/setup/) | wat je handmatig moet instellen |
| [`docs/legal/`](docs/legal/) | verwerkersovereenkomst |
| [`docs/archief/`](docs/archief/) | afgerond of nooit uitgevoerd |

## Deploy

Een push naar `main` deployt automatisch naar productie via Vercel — web en api
als aparte projecten. Werk daarom op een feature-branch.
