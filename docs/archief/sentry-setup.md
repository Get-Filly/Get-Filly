# Sentry setup — error-tracking voor backend + frontend

Op dit moment zien we productie-bugs pas wanneer een klant mailt.
Sentry vangt elke onverwachte error op en stuurt 'm naar een dashboard
met stacktrace, request-context en de gebruiker waarbij het misging.

> **Status**: setup-guide. Account aanmaken + DSN's invullen kost
> ~10 min. De code-integratie staat in deze doc — installeer pas als
> je de keys hebt zodat je niets `dummy-DSN`-hard-codeert.

---

## Stap 1: Account + project aanmaken (jouw actie)

1. Ga naar [sentry.io](https://sentry.io) → "Sign up" met je
   florisbwkoevermans@gmail.com.
2. Maak een organisatie aan: `get-filly` (of jouw bedrijfsnaam).
3. Maak **twee projecten**:
   - **Platform: Next.js** → naam: `get-filly-web`
   - **Platform: Node.js / NestJS** → naam: `get-filly-api`
4. Bij elk project: kopieer de **DSN** (begint met `https://...@…ingest.sentry.io/…`).
5. Optioneel: stel een **alert-rule** in: "Notify me on Slack/email
   when error occurs in production environment".

**Free-plan**: 5K errors/maand, voldoende voor MVP. Upgrade pas zodra
je echt klanten hebt.

---

## Stap 2: Backend (NestJS) integratie

### Installeren

```bash
cd apps/api
pnpm add @sentry/node @sentry/profiling-node
```

### Initialisatie

Maak nieuw bestand `apps/api/src/sentry.ts`:

```ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialiseer Sentry zo vroeg mogelijk in het opstart-proces.
// Wordt geïmporteerd vanuit main.ts vóór NestFactory.create().
//
// In dev (geen DSN gezet): Sentry doet niks — geen lokale noise,
// geen invloed op startup-tijd.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Tracing: 10% van requests bemonsteren is genoeg voor MVP en
    // houdt het quotum handelbaar bij grotere klant-aantallen.
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()],
    // Geen PII naar Sentry sturen — namen/emails van gasten zijn
    // gevoelig. Sentry maskeert dit by default; we zijn extra streng.
    sendDefaultPii: false,
  });
}
```

In `apps/api/src/main.ts` (eerste regel):

```ts
import './sentry';  // moet vóór alle andere imports

import { NestFactory } from '@nestjs/core';
// … rest blijft zoals het was
```

### Globale exception-filter (optioneel)

Voor extra context op elke unhandled error (welk endpoint, welke user,
welk restaurant) kun je een NestJS-filter toevoegen, maar Sentry's
default-handler vangt al alles op. Skip dit in MVP.

### Env-vars

Voeg toe aan `apps/api/.env`:

```bash
SENTRY_DSN=https://<jouw-key>@o<id>.ingest.sentry.io/<project-id>
```

In Railway/productie hetzelfde toevoegen aan de environment-variables.

---

## Stap 3: Frontend (Next.js) integratie

### Installeren

```bash
cd apps/web
pnpm add @sentry/nextjs
```

### Setup-wizard (gemakkelijkste pad)

```bash
cd apps/web
npx @sentry/wizard@latest -i nextjs
```

Wizard vraagt om je DSN + maakt automatisch:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- Update `next.config.js` met Sentry-webpack-plugin

### Env-vars

Voeg toe aan `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://<jouw-web-key>@o<id>.ingest.sentry.io/<project-id>
SENTRY_AUTH_TOKEN=<token-uit-sentry-org-settings>  # voor source-maps upload
```

In Vercel/productie hetzelfde toevoegen.

### Anti-noise: filter dev-errors

In `sentry.client.config.ts`:

```ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',  // dev-errors weren
  tracesSampleRate: 0.1,
  // Filter out: ResizeObserver loop limits (browser-noise),
  // network failures bij offline tabs.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
  ],
});
```

---

## Stap 4: Verificatie

### Backend test

```bash
cd apps/api
# Start dev-server
pnpm dev

# In een andere terminal: forceer een error
curl http://localhost:3001/api/restaurant/me
# (zonder auth-header → 401, geen sentry-event)

# Forceer een echte 500: gebruik je dashboard met een ongeldige token
```

Sentry-dashboard → `get-filly-api` → na 30s zou de error moeten
verschijnen met stacktrace.

### Frontend test

In `apps/web/src/app/dashboard/page.tsx` tijdelijk toevoegen:

```tsx
<button onClick={() => { throw new Error('Sentry test'); }}>
  Test Sentry
</button>
```

Klik de knop → check `get-filly-web` project. Verwijder de knop daarna.

---

## Wat je vervolgens moet doen

1. **Alerts instellen**: Sentry → Project → Alerts → "Notify on first
   seen error in production" naar je email.
2. **Performance budget**: stel `tracesSampleRate` later naar beneden
   bij snel groeiend traffic.
3. **Source maps uploaden**: `SENTRY_AUTH_TOKEN` zorgt dat de Sentry-
   webpack-plugin source-maps mee-uploadt; dan zie je leesbare
   stacktraces i.p.v. minified code.
4. **PII-policy reviewen**: Sentry's default maskeert wachtwoorden;
   check Settings → Security & Privacy of dit aanstaat voor jouw org.

---

## Troubleshooting

**"Errors verschijnen niet in dashboard"** — check `NODE_ENV` (Sentry
draait alleen in `production` op de frontend). In backend altijd aan
zolang `SENTRY_DSN` gezet is.

**"Quotum bereikt"** — Sentry rate-limit'd je free-plan. Verlaag
`tracesSampleRate` of upgrade naar Team-plan ($26/maand).

**"Geen source maps"** — `SENTRY_AUTH_TOKEN` ontbreekt of klopt niet.
Maak nieuwe token in Sentry → Settings → Auth Tokens met scope
`project:write`.
