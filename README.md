# Get-Filly — Code

Codebase voor Get-Filly (monorepo).

## Structuur
- `apps/web/` — Next.js frontend (dashboard + publieke site)
- `apps/api/` — Nest.js backend (komt later)
- `packages/shared/` — gedeelde TypeScript types (komt later)

## Ontwikkelen
```bash
# eenmalig installeren
pnpm install

# frontend starten (draait op http://localhost:3000)
pnpm --filter web dev
```

## Specs
Alle product- en techspecs staan in [`../PROJECT/`](../PROJECT/).
