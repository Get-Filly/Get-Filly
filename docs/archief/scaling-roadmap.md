# Scaling-roadmap — van 1 instance naar 1000+ klanten

Op dit moment draait Get-Filly op één Node-process. Dat werkt prima
tot ~50-100 actieve klanten. Daarna komen er stuk voor stuk
bottlenecks. Deze doc is geen actie-lijst — het is een routekaart
zodat je weet wát er moet veranderen wanneer.

---

## Huidige beperkingen (single-instance)

### Wat nu in proces-geheugen leeft

1. **Pre-onboarding rate-limit Map** in `OnboardingController` —
   in-memory teller voor IPs die nog geen account hebben.
   *Symptoom bij multi-instance*: één IP kan langs alle limits omdat
   elke pod z'n eigen Map heeft.
2. **AI rate-limit cache** in `AiRateLimitGuard` — al via DB (geen
   probleem), maar de query naar `ai_usage` per call kost latency.
3. **Cookie-sessie / JWT-validatie** — stateless via Supabase JWT, dus
   OK voor multi-instance.
4. **Filly-chat state** — alles in DB, OK.
5. **Storage-uploads** — via Supabase Storage, niet lokaal disk, OK.

### Bottlenecks bij groei

| Bij ... | Wat klapt | Oplossing |
|---------|-----------|-----------|
| ~50 actieve users | Cold-starts op Railway-hobby-plan | Upgrade naar Railway Pro |
| ~100 gelijktijdige chat-calls | Anthropic rate-limit hit | Anthropic-tier upgraden |
| Eerste menu-vision-burst (10 uploads tegelijk) | 10x 5-15s in-memory base64 → OOM | Job-queue (BullMQ + Upstash Redis) |
| Eerste multi-instance deploy | In-memory state divergeert | Pre-onboarding rate-limit naar Redis |
| ~500 actieve klanten | DB-CPU op Supabase-free-tier limiet | Supabase Pro ($25/mnd) |
| ~1000 klanten | Single-region latency Aziatische klanten | Edge-functions / multi-region |

---

## Fase 1: Tot 100 actieve klanten (huidige stack volstaat)

**Geen actie nodig**, behalve:

- [ ] Supabase upgraden naar Pro ($25/mnd) zodra DB-CPU >70% piekt.
- [ ] Sentry + cost-alerts actief (zie aparte docs).
- [ ] Backups: Supabase Pro doet daily backups automatisch.

Single Railway-instance + Vercel volstaan.

---

## Fase 2: 100-500 klanten — pre-multi-instance hardening

Voorbereiden op horizontaal schalen.

### Redis/Upstash toevoegen

1. [Upstash](https://upstash.com) account → Redis-database aanmaken
   (gratis tier: 10K commands/day, voldoende).
2. Env-vars in Railway: `REDIS_URL`, `REDIS_TOKEN`.
3. Vervang in-memory state:
   - Pre-onboarding rate-limit (`OnboardingController`)
   - Eventuele andere `Map`-state die we toekomstig zouden bouwen
4. Code-pattern: gebruik `@upstash/redis` package, niet `ioredis` —
   serverless-first, geen connection-pool overhead.

### Job-queue voor zware AI-calls

Menu-vision en website-analyzer zijn 5-15s blocking. Bij gelijktijdige
uploads: process loopt vol.

1. Installeer **BullMQ** (vereist Redis):
   ```bash
   pnpm add bullmq
   ```
2. Maak `apps/api/src/queue/menu-import.queue.ts`. Endpoint pusht een
   job en returnt direct `{ job_id }`. Worker processeert async.
3. Frontend polling `/api/menu/imports/:jobId` of via Supabase Realtime
   subscription op `menu_uploads.processed_at`.

**UX-verschil**: in plaats van 5-15s spinner krijgt user direct
"Filly is bezig — check straks terug" en het runt op de achtergrond.
Voor MVP overkill, voor 100+ klanten essentieel.

---

## Fase 3: 500+ klanten — horizontaal schalen

### Multiple Railway-instances

1. Railway → service → Settings → **Replicas: 2-4**.
2. Voorwaarden waaraan alle code moet voldoen:
   - Alle state in DB of Redis
   - Geen lokale file-writes (Storage gebruiken)
   - Idempotent endpoints
3. Healthcheck endpoint `/api/health` toevoegen voor Railway's
   load-balancer.

### Database read-replicas

Supabase Pro → Read Replicas. Lees-zware queries (KPI-aggregaties,
rapportages-pagina) routeren naar replica zodat write-DB minder
belast wordt.

### CDN voor static assets

Vercel doet dit al automatisch voor frontend. Voor API: Cloudflare
voor de API-domein zodat headers/auth-checks aan de edge gebeuren.

---

## Fase 4: 1000+ klanten — multi-region

Ver weg toekomst. Belangrijkste:

- **Supabase: meerdere regions** (Pro Plus plan).
- **Edge-functions** voor latency-sensitive endpoints (Vercel Edge of
  Supabase Edge Functions).
- **Geo-routing** op DNS-niveau (Cloudflare).

Niet relevant voor MVP — vermeld voor de volledigheid.

---

## Wat NU al in elkaar zit voor schaal

✅ **Stateless backend**: Supabase JWT, geen sessies in geheugen.
✅ **Storage in Supabase**: geen lokale disk-uploads.
✅ **AI-rate-limit per restaurant** via DB-aggregatie (niet in mem).
✅ **Database-design met FK's** + indexes op multi-tenant kolommen.
✅ **Tenant-isolatie** via guards op klasse-niveau (defense-in-depth).

---

## Wat een nieuwe lijn code MOET respecteren

Als checklist voor toekomstige PRs zodat we niet per ongeluk iets
schaal-onvriendelijks introduceren:

- [ ] Geen `const cache = new Map()` op module-niveau in een service —
      gebruik DB of Redis.
- [ ] Geen `setInterval` of `setTimeout` op module-niveau —
      cron-achtige logic via een externe scheduler (Supabase
      pg_cron, externe Trigger.dev, etc).
- [ ] Geen file-writes naar local fs — alles via Supabase Storage.
- [ ] Geen "zware" sync-call (>2s) blocking de event-loop —
      offload naar job-queue.
- [ ] Database-queries moeten altijd `.eq('restaurant_id', x)` of
      vergelijkbare tenant-scope hebben (audit door reviewer).
- [ ] Nieuwe endpoint: rate-limit toevoegen als de operatie
      duur/intensief is (AI-call, file-upload, mass-mail).

---

## Concrete metrics om in de gaten te houden

Zodra Sentry + Anthropic-cost-alerts live zijn:

| Metric | Bron | Drempel |
|--------|------|---------|
| API p95-latency | Sentry Performance | <500ms |
| Error-rate | Sentry | <0.5% van requests |
| DB-connections | Supabase Dashboard | <70% van pool |
| DB-CPU | Supabase Dashboard | <70% sustained |
| Anthropic-spend | Anthropic Console | <80% van monthly limit |
| Cache-hit-ratio | `ai_usage.cached_input_tokens / input_tokens` | >40% bij chat-feature |

Wekelijkse 10-min check op deze nummers waarschuwt je vóórdat de
schaal-grenzen raken.
