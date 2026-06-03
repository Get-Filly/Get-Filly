# CRM-koppeling — nieuwe klant uitnodigen

Hoe het CRM een nieuwe Get-Filly-klant aanmaakt + uitnodigt. Eén beveiligde
server-to-server call; de rest (account aanmaken, mail, wachtwoord, onboarding)
regelt Get-Filly.

## Flow

```
CRM (server-side)
  └─ POST /api/integrations/crm/invite { email }   [Authorization: Bearer <sleutel>]
       └─ Get-Filly maakt het account aan (Supabase, service_role)
            └─ Supabase stuurt de invite-mail (huisstijl + onboarding-tips)
                 └─ klant klikt "Account activeren" → /welkom (wachtwoord instellen)
                      └─ /dashboard → middleware → /onboarding → klaar
```

## Endpoint (dit krijgt je collega)

```
POST  https://get-filly-api-three.vercel.app/api/integrations/crm/invite

Headers:
  Authorization: Bearer <CRM_INTEGRATION_API_KEY>
  Content-Type: application/json

Body:
  { "email": "klant@restaurant.nl" }     ← verplicht

Antwoord:
  200  { "ok": true, "status": "invited" }          ← uitnodiging verstuurd
  200  { "ok": true, "status": "already_exists" }   ← bestond al (idempotent, geen dubbele mail)
  400  { ... }   ongeldig e-mailadres
  401  { ... }   sleutel ontbreekt of klopt niet
```

### Voorbeeld (curl)

```bash
curl -X POST https://get-filly-api-three.vercel.app/api/integrations/crm/invite \
  -H "Authorization: Bearer $CRM_INTEGRATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "email": "klant@restaurant.nl" }'
```

> **Belangrijk — alleen server-side.** De sleutel mag NOOIT in een browser /
> frontend / no-code-frontend terechtkomen. Roep dit endpoint aan vanaf de
> CRM-backend (of een serverless functie / webhook), zodat de sleutel geheim
> blijft. Lekt de sleutel: roteren (zie hieronder) en de oude waarde vervalt.

## Configuratie (Get-Filly-kant, eenmalig)

1. **API-sleutel** — genereer een sterke waarde (`openssl rand -hex 32`) en zet
   die als env-var `CRM_INTEGRATION_API_KEY`:
   - in het Vercel-project **`get-filly-api`** (Production + Preview),
   - in `apps/api/.env` voor lokaal.
   Deel dezelfde waarde veilig met de CRM-kant (niet via de repo).
2. **Redirect-URL whitelisten** — Supabase → Authentication → URL Configuration
   → Redirect URLs: voeg `<WEB_URL>/welkom` toe (bv. `https://get-filly.com/welkom`).
   Zonder dit weigert Supabase de invite met een redirect-fout.
3. **Mailtemplate uitrollen** — `pnpm supabase:apply-templates` (zet de
   invite-mail met onboarding-tips live).

## Sleutel roteren

Nieuwe waarde genereren, `CRM_INTEGRATION_API_KEY` in Vercel updaten, en de
nieuwe waarde aan de CRM-kant zetten. De oude sleutel werkt dan direct niet meer.

## Implementatie (Get-Filly)

- Endpoint + logica: `apps/api/src/integrations/` (controller, `CrmInviteService`,
  `CrmApiKeyGuard`).
- Activatiepagina: `apps/web/src/app/welkom/page.tsx`.
- Mailtemplate: `scripts/supabase-email-templates.mjs` (variant `invite`).
- Elke uitnodiging wordt gelogd in `audit_log` (`customer_invited` /
  `customer_invite_skipped_exists`).
