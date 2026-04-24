# Supabase handmatige setup

Alles wat niet in migraties staat maar wél nodig is voor een werkende
Supabase-omgeving. Gebruik dit document als je:

1. Een nieuw Supabase-project opzet (verhuizing, staging, reset)
2. Wil verifiëren dat de huidige productie-Supabase klopt
3. Verloren bent gegaan en wil weten "wat moest ik ook weer handmatig?"

**Huidig project**: `ttoizamfscichcmzmnsw` (West-EU).

---

## 1. Migraties runnen

Zet de migraties in volgorde aan. Supabase-CLI is niet gelinkt in deze
repo, dus handmatig via Dashboard → SQL Editor:

```
apps/api/supabase/migrations/
  0001_initial_schema.sql
  0002_seed_april_full.sql
  0003_account_profile_extensions.sql
  0004_fase1_richer_data.sql
  0005_reservations_and_reviews.sql
  0006_restaurant_users_permissions.sql
  0007_team_members_rpc.sql
  0008_invitations.sql
  0009_ai_usage.sql
```

Voor elk: open bestand, kopieer inhoud, plak in nieuwe SQL-editor-tab,
klik Run. Verwacht "Success. No rows returned" (of row-count voor seeds).

---

## 2. Authentication → URL Configuration

**Waar**: Supabase Dashboard → Authentication → URL Configuration

- **Site URL**: `http://localhost:3000` (dev) of je productie-domein
- **Redirect URLs** — deze MOETEN in de allowlist staan:
  - `http://localhost:3000/**` (dev, dubbele ster = alle paden)
  - `https://app.get-filly.com/**` (als app-subdomein live komt)
  - `https://get-filly.com/**` (als publieke site daarop komt)

Zonder correcte redirect URLs mislukt de invite-flow (Supabase weigert
magic-links te genereren naar niet-allowlisted URLs).

---

## 3. Authentication → Email Templates

**Waar**: Supabase Dashboard → Authentication → Email Templates

Twee templates moeten gewijzigd zijn om door onze SSR-cookie-flow te
werken (i.p.v. de default hash-token-flow die niet werkt met
`@supabase/ssr`):

### Template "Invite user"

Standaard action-link vervangen door:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}
```

Onderwerp kan blijven als: "Uitnodiging voor Get Filly".

### Template "Magic Link"

Idem:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}
```

### Template "Reset Password"

Voor de password-reset-flow (pagina `/forgot-password` → `/reset-password`):
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

De frontend zet `redirectTo` op `${origin}/reset-password` in
`resetPasswordForEmail()`; Supabase geeft dat mee als `{{ .RedirectTo }}`.
Wij negeren die hier bewust en forceren `/reset-password` — voorkomt
dat een foutief redirect-param de flow breekt.

**Waarom dit hele patroon**: de default `action_link` uit `generateLink()`
werkt niet met `@supabase/ssr` (die cookie-based is, niet hash-based).
Onze `/auth/confirm`-route doet `verifyOtp({ token_hash, type })` en zet
de sessie als cookie. Hetzelfde fundament voor invite, magic-link, signup
en password-reset.

---

## 4. Storage buckets

**Waar**: Supabase Dashboard → Storage

- `restaurant-assets` — **bestaat, aangemaakt door migratie 0003**. Public = true.
- `menu-uploads` — **bestaat nog niet**. Wordt aangemaakt wanneer de
  menu-vision feature komt (zie BACKLOG.md).

---

## 5. Test-data seeds

De seed-data voor migraties 0002 dekken Bistro Get-Filly. Voor
multi-tenant tests is er een tweede restaurant + extra user-koppelingen
nodig. Die staan als losse SQL-snippets in:

```
apps/api/supabase/seeds/
  test_restaurants.sql   — Cafe Get-Filly (id …002) + developer@get-filly.com
  test_campaigns.sql     — (indien van toepassing — zie BACKLOG)
```

Run ze na alle migraties als je multi-tenant wil testen.

Deze bestanden zijn **idempotent** (gebruiken `on conflict do nothing`)
dus meermaals runnen is veilig.

---

## 6. Env-variabelen in de app

`.env` en `.env.local` staan niet in git. Vul ze per laptop:

### `apps/api/.env`
```
SUPABASE_URL=<Project Settings → API → Project URL>
SUPABASE_SECRET_KEY=<Project Settings → API → service_role key>
ANTHROPIC_API_KEY=<console.anthropic.com → Settings → API Keys>
```

### `apps/web/.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=<zelfde als SUPABASE_URL hierboven>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Project Settings → API → anon/publishable key>
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**Bewaar deze 3 secrets** in een wachtwoordmanager:
- `SUPABASE_SECRET_KEY`
- `ANTHROPIC_API_KEY` (is maar 1× zichtbaar bij aanmaak!)
- `SUPABASE_PUBLISHABLE_KEY` (regenereerbaar via dashboard, maar handig)

---

## 7. Verificatie-checklist na een verse setup

Runnen in SQL-editor na alle migraties + seeds:

```sql
-- 1. Alle tabellen aanwezig (verwacht ~25)
select count(*) as tabellen from information_schema.tables
where table_schema = 'public';

-- 2. Storage buckets (verwacht: restaurant-assets, public=true)
select id, name, public from storage.buckets;

-- 3. Demo-restaurant aanwezig
select id, name from public.restaurants where id = '00000000-0000-0000-0000-000000000001';
-- verwacht: Bistro Get-Filly

-- 4. Test-restaurant aanwezig (na test_restaurants.sql seed)
select id, name from public.restaurants where id = '00000000-0000-0000-0000-000000000002';
-- verwacht: Cafe Get-Filly

-- 5. ai_usage-tabel bestaat
select count(*) from public.ai_usage;
-- verwacht: 0 (nieuwe omgeving) of >0 (bestaande)

-- 6. RLS aan op alle relevante tabellen
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in (
  'restaurants','users','guests','reservations','reviews','campaigns',
  'chat_conversations','chat_messages','ai_usage','invitations'
);
-- verwacht: allemaal true
```

Een van deze false? → check welke migratie niet liep.

---

## 8. Auth-provider instellingen (optioneel)

**Waar**: Authentication → Providers

- **Email** — aan (default)
- **Password-based signup** — aan
- **Email confirmation** — aan (gebruiker moet e-mail verifiëren)

SMTP blijft Supabase-default tot we Resend koppelen (zie BACKLOG.md).

---

## Changelog van dit document

- **2026-04-23**: initiële versie — migraties t/m 0009, Filly-AI live,
  seeds-folder geintroduceerd.
