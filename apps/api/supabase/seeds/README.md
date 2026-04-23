# Supabase seeds

Losse SQL-snippets die NIET in migraties horen, maar wel herbruikbaar
moeten zijn. Denk aan test-restaurants, test-users, of wegwerp-seed-data
voor demo's.

## Conventie

- **Idempotent**: elke seed moet meerdere keren te runnen zijn zonder
  te breken. Gebruik `on conflict do nothing` bij inserts.
- **Volgorde**: run seeds NA alle migraties 0001-0009.
- **Scope**: alleen data-inserts, geen schema-wijzigingen. Schema hoort
  in migraties.

## Bestanden

- `test_restaurants.sql` — tweede test-restaurant "Cafe Get-Filly"
  (id `…002`) + ontwikkelaar-user gekoppeld aan beide restaurants.
  Nodig voor multi-tenant tests (restaurant-switcher).

## Hoe runnen

Supabase Dashboard → SQL Editor → nieuwe query → inhoud van `.sql`-bestand
plakken → Run.

Supabase-CLI is niet gelinkt aan deze repo, anders zou `supabase db push`
dit automatisch doen.
