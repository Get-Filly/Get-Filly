# Get-Filly — Code

Codebase voor Get-Filly (monorepo).

## Structuur
- `apps/web/` — Next.js frontend (dashboard + publieke site) — draait op `http://localhost:3000`
- `apps/api/` — Nest.js backend — draait op `http://localhost:3001`
- `packages/shared/` — gedeelde TypeScript types (komt later)

## Ontwikkelen
```bash
# eenmalig installeren
pnpm install

# alles tegelijk starten (frontend + backend)
pnpm dev

# of apart
pnpm dev:web   # alleen frontend
pnpm dev:api   # alleen backend
```

## Test
- Frontend: http://localhost:3000
- Backend hello: http://localhost:3001/api/hello

## Specs
Product- en techspecs staan buiten deze repo, in de iCloud-map
`~/Documents/6. Claude/5. Get-Filly/Get-Filly/PROJECT/`.
