# Staging-omgeving — setup

Op dit moment is "code committen" hetzelfde als "live op productie" —
geen tussenlaag voor tests, geen veilige plek voor Meta-OAuth-flows
of andere reviews. Een staging-omgeving lost dat op.

> **Status**: setup-guide. Meerdere accounts/services nodig + ~30-60 min
> werk eenmalig. Pas oppakken als je een eerste klant in zicht hebt
> en risico-loos wilt kunnen previewen.

---

## Wat staging je oplevert

1. **Veilig testen**: nieuwe features eerst tegen een fake-klant
   uitproberen voordat ze raken aan echte data.
2. **Meta App Review**: Instagram + Facebook OAuth-review verlangt
   een werkende app-URL met test-account waar de reviewer kan inloggen.
3. **Demo-omgeving**: kandidaat-klanten een werkend prototype tonen
   zonder dat ze tussen echte productie-data zitten.
4. **DB-migratie test**: 0021 eerst tegen staging draaien, kijken of
   alles werkt, dan productie.

---

## Architectuur

| Component | Productie | Staging |
|-----------|-----------|---------|
| Web-app | `app.get-filly.com` (Vercel main) | `staging.get-filly.com` (Vercel preview-branch) |
| API | Railway production | Railway staging-instance |
| DB | Supabase project: `get-filly-prod` | Supabase project: `get-filly-staging` |
| Anthropic key | `get-filly-prod` | `get-filly-staging` (lager budget) |
| Sentry | `get-filly-web` / `get-filly-api` met `environment: production` | zelfde projecten met `environment: staging` |

---

## Stap 1: Tweede Supabase-project

1. [supabase.com](https://supabase.com) → New project →
   `get-filly-staging`. **Niet** dezelfde organisatie nodig, maakt
   later billing wel makkelijker als je 'm in dezelfde org zet.
2. Wacht ~2 min tot 't draait.
3. Kopieer:
   - Project URL → wordt `SUPABASE_URL` voor staging
   - `anon` key → wordt `SUPABASE_ANON_KEY`
   - `service_role` key → wordt `SUPABASE_SERVICE_ROLE_KEY`
4. Run alle migraties (0001-0020) tegen dit nieuwe project. Met de
   Supabase CLI:
   ```bash
   cd apps/api
   supabase link --project-ref <staging-ref>
   supabase db push
   ```
   Of handmatig: open SQL Editor, plak elke migratie achter elkaar.
5. Maak een **test-restaurant** aan in staging zodat de UI niet leeg
   is voor reviewers/demo's. Gebruik
   `apps/api/supabase/seeds/test_restaurants.sql` (idem als productie
   ooit had).

---

## Stap 2: Tweede Railway-instance (backend)

Optie A — **Aparte service in zelfde Railway-project**:
1. Railway dashboard → jouw `get-filly`-project → **+ New** →
   "GitHub repo" → kies dezelfde repo + branch `staging`.
2. Service-naam: `api-staging`.
3. Custom domain: `api-staging.get-filly.com` (of laat Railway-default).

Optie B — **Helemaal apart Railway-project**:
- Cleaner maar duurder. Voor MVP: ga voor A.

In beide gevallen: zet de **environment variables** anders dan productie:
- `SUPABASE_URL` → staging-URL
- `SUPABASE_SERVICE_ROLE_KEY` → staging service-role
- `ANTHROPIC_API_KEY` → `get-filly-staging` key uit Anthropic Console
- `NODE_ENV=staging`
- `SENTRY_DSN` → zelfde DSN, andere environment-tag (zie hieronder)

---

## Stap 3: Vercel preview-deploy

Gemakkelijk: Vercel maakt automatisch een preview-deploy per pull
request én per non-main branch.

1. Vercel dashboard → `get-filly-web` → Settings → Git → "Production
   Branch" = `main` (default).
2. Maak een nieuwe branch `staging` op GitHub. Push 'm leeg.
3. Vercel detecteert de branch automatisch en deployt naar
   `get-filly-web-git-staging-<jouw-team>.vercel.app`.
4. Custom domain (optioneel maar netter): in Vercel → Domains →
   `staging.get-filly.com` → assign aan `staging`-branch.
5. **Per-branch env-vars**: Vercel → Settings → Environment Variables
   → maak twee sets:
   - **Production** (alleen `main`): productie-API-URL etc
   - **Preview** (alle andere branches): staging-API-URL etc

`NEXT_PUBLIC_API_URL` op staging = `https://api-staging.get-filly.com/api`.

---

## Stap 4: Password-protection op staging

Open staging mag niet publiek crawlable / vindbaar door bots.

**Optie 1 — Vercel password-protection**: Vercel → Settings →
Deployment Protection → "Vercel Authentication" of "Password protect".
$20/maand op Pro-plan.

**Optie 2 — Eigen middleware** (gratis): Voeg toe aan
`apps/web/src/middleware.ts`:

```ts
// Alleen voor staging: vraag basic-auth voor alle routes.
if (process.env.NEXT_PUBLIC_APP_ENV === 'staging') {
  const auth = request.headers.get('authorization');
  const expected = `Basic ${btoa(process.env.STAGING_BASIC_AUTH ?? '')}`;
  if (auth !== expected) {
    return new Response('Login required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Staging"' },
    });
  }
}
```

Set in Vercel preview-env: `STAGING_BASIC_AUTH=admin:supersecret123`.

---

## Stap 5: Workflow

```
feature-branch → push → Vercel maakt preview-URL voor die branch
       ↓
       PR maken naar main
       ↓
       review + merge → automatisch productie
```

**Voor grotere features die je eerst tegen staging wilt zien**:
- Werk op `feature/xyz` branch
- Merge eerst in `staging`-branch → test op `staging.get-filly.com`
  tegen `get-filly-staging` Supabase
- Pas merge naar `main` als alles klopt

---

## Stap 6: DB-migraties op staging

Per nieuwe migratie:
```bash
cd apps/api

# Eerst staging
supabase link --project-ref <staging-ref>
supabase db push

# Test je code tegen staging URL → werkt het?
# Pas dan productie:
supabase link --project-ref <prod-ref>
supabase db push
```

Of beheer met config-files: `supabase/config.toml` per environment.
Zie [Supabase docs](https://supabase.com/docs/guides/cli/local-development).

---

## Kosten-impact

| Service | Productie | Staging | Extra |
|---------|-----------|---------|-------|
| Supabase | Free tier | Free tier | $0 |
| Railway | Hobby ($5/mnd) | extra service ~$5/mnd | $5 |
| Vercel | Hobby (free) | preview gratis | $0 |
| Anthropic | (variabel) | $5-10 budget genoeg | $5-10 |
| Sentry | Free tier | zelfde tier | $0 |

**Totaal**: ~$10-15/maand voor een werkende staging. Verwaarloosbaar
zodra je een eerste klant hebt.

---

## Veelgemaakte fouten

1. **Productie-DB als staging gebruiken** → testdata in productie.
   Strict gescheiden Supabase-projecten.
2. **Zelfde Anthropic-key** voor beide → kosten lopen door elkaar.
   Aparte keys per environment (zie cost-alerts doc).
3. **Vergeten staging-DB te migreren** vóór productie → 'het werkte
   lokaal' issue. Altijd staging eerst.
4. **Geen test-data op staging** → reviewers/demo's zien leeg dashboard.
   Seed minimaal één test-restaurant.
