# apps/web — Next.js frontend

De publieke site én het ingelogde dashboard van Get-Filly. Next.js 16 met de App
Router en Turbopack. Draait lokaal op `http://localhost:3000`.

```bash
pnpm dev:web          # alleen de frontend
pnpm dev              # frontend + backend samen (vanaf de repo-root)
```

De backend moet mee draaien voor alles achter de login; `NEXT_PUBLIC_API_URL`
in `.env` wijst ernaar.

## Structuur

Alle routes hangen onder een `[locale]`-segment — de site is tweetalig (NL/EN),
teksten staan in `messages/{nl,en}.json`.

| Pad | Wat |
|---|---|
| `src/app/[locale]/` | publieke site, auth-schermen, onboarding |
| `src/app/[locale]/dashboard/` | het ingelogde deel |
| `src/app/[locale]/proto-*/` | prototypes: publiek bereikbaar, maar uit de zoekindex via `robots.ts` |
| `src/lib/api.ts` | `authedFetch` — stuurt JWT + `X-Business-Id` automatisch mee |
| `src/lib/business-context.tsx` | welke zaak actief is |
| `src/middleware.ts` | auth-guard, redirect naar `/login` |

Let op: `AGENTS.md` in deze map (waar `CLAUDE.md` naar verwijst) waarschuwt dat
deze Next.js-versie afwijkt van wat modellen uit hun training kennen — lees bij
twijfel `node_modules/next/dist/docs/`.

Zie [`../../CLAUDE.md`](../../CLAUDE.md) voor de projectcontext.
