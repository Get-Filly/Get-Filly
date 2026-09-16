# Database-migraties — workflow + Supabase CLI

Tot nu toe runden we elke SQL-file handmatig in de Supabase SQL Editor.
Dat is een single-point-of-failure: vergeten = silent productie-bug.
Deze doc beschrijft de "veilige" workflow met de officiële Supabase CLI
zodat we straks `pnpm db:migrate` kunnen draaien tegen elke omgeving.

> **Status**: setup-guide. Setup hieronder uitvoeren → daarna gaan
> nieuwe migraties via de CLI. Bestaande migraties (0001-0020) blijven
> handmatig gerund — de CLI markeert ze als "al toegepast" zodat je
> ze niet dubbel runt.

---

## Eenmalige setup (lokaal)

### 1. Supabase CLI installeren

```bash
# macOS via Homebrew
brew install supabase/tap/supabase
```

Of via npm (alternatief): `npm install -g supabase`.

### 2. Verbinden met je project

```bash
cd /Users/floriskoevermans/Projects/get-filly

# Init Supabase-config in apps/api/supabase (bestaat al deels)
cd apps/api
supabase init

# Login + link aan jouw productie-project
supabase login          # opent browser, klik "Authorize"
supabase link --project-ref <jouw-project-ref>
```

> **Project-ref** vind je in Supabase Dashboard → Project Settings →
> General → Reference ID (bv. `abcdefgh1234567`).

### 3. Bestaande migraties markeren als "al toegepast"

Omdat 0001-0020 al handmatig gerund zijn op productie moeten we de
CLI vertellen dat deze migraties al klaar zijn — anders probeert hij
ze opnieuw te draaien en geeft errors.

```bash
# Vanuit apps/api/
supabase migration repair --status applied 0001 0002 0003 0004 0005 \
  0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 \
  0019 0020
```

Daarna check:

```bash
supabase migration list
```

Alle 20 zouden `Applied` moeten zijn.

### 4. Script toevoegen aan package.json

Voeg toe in `apps/api/package.json`:

```json
"scripts": {
  "db:migrate": "supabase db push",
  "db:diff": "supabase db diff",
  "db:status": "supabase migration list"
}
```

En in root `package.json` (om `pnpm db:migrate` te ondersteunen):

```json
"scripts": {
  "db:migrate": "pnpm --filter @get-filly/api db:migrate"
}
```

---

## Workflow voor nieuwe migraties

### Nieuwe migratie maken

```bash
cd apps/api
supabase migration new beschrijvende_naam_van_de_wijziging
```

Dit maakt `apps/api/supabase/migrations/<timestamp>_beschrijvende_naam.sql`
aan. Schrijf je SQL erin (zelfde patroon als 0001-0020).

### Lokaal testen (optioneel maar aanbevolen)

```bash
# Start een lokale Supabase (Docker required)
supabase start

# Run alle pending migraties op lokale instance
supabase db reset

# Test je code tegen de lokale DB door SUPABASE_URL te wisselen
```

### Naar productie pushen

```bash
# Vanuit apps/api/
pnpm db:migrate          # = supabase db push
```

De CLI vergelijkt jouw lokale migrations-folder met wat al op
productie is toegepast en runt alleen wat nieuw is.

---

## Conventies

- **Naamgeving**: `<nummer>_<snake_case_doel>.sql`. CLI-default zet er
  een timestamp voor, dat is OK; bestaande nummering 0001-0020 blijft
  voor leesbaarheid.
- **Idempotent**: gebruik `if not exists`, `add column if not exists`,
  `do $$ … $$ blocks` voor constraint-renames. Zo kun je een
  migratie veilig opnieuw draaien als iets half lukte.
- **Geen rollbacks**: we doen forward-only. Een fout is een nieuwe
  migratie, niet een revert. Houdt audit-trail rechtlijnig.
- **Test eerst lokaal**: pas naar productie pushen als je 'm tegen
  een lokale Supabase hebt zien werken.
- **Eén logische wijziging per migratie**: maakt review en debug
  veel makkelijker.

---

## Veiligheidsregels voor productie

- **Nooit `drop column` zonder migratie-pad**: oude code kan nog
  vragen om de kolom. Eerst code uitfaseren, dan kolom droppen in
  een latere migratie.
- **Index-wijzigingen op grote tabellen**: gebruik
  `create index concurrently` om de tabel niet te locken.
- **Defaults op grote tabellen**: voeg kolom eerst toe zonder default
  (snel), update in batches, set dan default — i.p.v. één grote
  migratie die de tabel uren lockt.
- **Test op staging eerst** zodra staging-omgeving live is (zie
  `docs/staging-setup.md`).

---

## Troubleshooting

**"Migration history mismatch"** — CLI verwacht een migratie die niet
op productie staat. Run `supabase migration repair --status applied
<nummer>` om handmatig al-toegepaste migraties te markeren.

**"Migration X failed"** — fix de SQL-fout in de migratiefile, dan
opnieuw `supabase db push`. Als de migratie deels heeft gedraaid moet
je de DB handmatig terugzetten of een nieuwe migratie schrijven die
de half-state oplost.

**"Connection refused"** — `supabase login` opnieuw, of check of de
project-ref in `supabase/config.toml` klopt.
