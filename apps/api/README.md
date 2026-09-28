# apps/api — Nest.js backend

De backend van Get-Filly. Draait lokaal op `http://localhost:3001` en in
productie als serverless functions op Vercel (regio `fra1`, zie `vercel.json`).

```bash
pnpm dev:api          # alleen de api
pnpm dev              # api + web samen (vanaf de repo-root)
```

## Belangrijk bij het werken hier

**Start de API echt op na elke module-wijziging:**

```bash
node dist/main.js
```

en kijk of "successfully started" verschijnt. `tsc`, `eslint`, `jest` en
`nest build` starten de DI-container geen van alle op — een provider die in
`exports` staat maar niet in `providers` laat Nest de héle applicatie weigeren,
en dat is voor alle vier onzichtbaar. Zo lag de productie-API een keer uren
plat.

## Structuur

| Map | Waarvoor |
|---|---|
| `common/` | guards (auth, business-access, rate-limit), decorators, token-encryptie |
| `ai/` | centrale Claude-wrapper, Filly's brein-config, branche-packs |
| `busyness/` | rustige momenten: detectie, datum-signalen, terugkoppeling |
| `campaigns/`, `chat/`, `reviews/`, `menu/`, `guests/`, `team/` | de features |
| `meta/`, `tiktok/`, `google-business/` | koppelingen met versleutelde tokens |
| `supabase/migrations/` | SQL 0001–0076, handmatig te draaien in de SQL Editor |

## Conventies

- Elke business-gescopete controller hangt onder
  `@UseGuards(AuthGuard, BusinessAccessGuard)`; de header `X-Business-Id` is
  verplicht en er is géén fallback-id.
- Claude-aanroepen lopen altijd via
  `AiService.generateText({ meta: { restaurantId, userId, feature } })`, zodat
  het verbruik getraceerd wordt. TypeScript dwingt dat af.

Zie [`../../CLAUDE.md`](../../CLAUDE.md) voor de projectcontext en
[`../../docs/werking/database-schema.md`](../../docs/werking/database-schema.md)
voor het datamodel.
