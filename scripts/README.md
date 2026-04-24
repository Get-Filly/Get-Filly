# scripts/

Wegwerp- en beheer-scripts. Niet voor runtime-gebruik vanuit de apps —
alleen om lokaal te draaien door de developer.

## apply-supabase-auth-config.mjs

Zet de 4 email-templates (invite, magic-link, recovery, confirmation)
+ onderwerpen op Supabase via de Management API. Bronnen leven in
[`supabase-email-templates.mjs`](./supabase-email-templates.mjs).

### Eenmalige setup

1. **Personal Access Token** aanmaken:
   - Ga naar [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   - Klik **Generate new token**, noem 'm bv. `get-filly-dev`
   - Kopieer de token (begint met `sbp_…`, is maar één keer zichtbaar)
2. Voeg toe aan `apps/api/.env`:
   ```
   SUPABASE_ACCESS_TOKEN=sbp_...
   SUPABASE_PROJECT_REF=ttoizamfscichcmzmnsw
   ```

### Runnen

Vanuit de repo-root:
```bash
pnpm supabase:apply-templates
```

Verwacht:
```
→ PATCH https://api.supabase.com/v1/projects/ttoizamfscichcmzmnsw/config/auth
  Updates: 8 velden (4 subjects + 4 bodies)

✓ Alle 4 email-templates + subjects op Supabase bijgewerkt.
  - invite        (Uitnodiging voor Get Filly)
  - magic_link    (Je login-link voor Get Filly)
  - recovery      (Reset je Get Filly-wachtwoord)
  - confirmation  (Bevestig je Get Filly-account)
```

### Template aanpassen

Bewerk [`supabase-email-templates.mjs`](./supabase-email-templates.mjs),
run het script opnieuw. Geen git-hook voor auto-sync — bewust; je wil
niet dat elke push op main meteen je productie-mails wijzigt.

### Wat overschrijft het script?

Alleen de 8 relevante velden (`mailer_subjects_*` + `mailer_templates_*_content`).
Andere auth-settings (redirect URLs, site URL, password-sterkte,
rate-limits, etc.) blijven ongemoeid.
