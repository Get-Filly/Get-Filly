-- ============================================================
-- 0079: busyness_daily + busyness_day_context (dagoverzicht)
-- ============================================================
-- Waarom: busyness_snapshots houdt de ruwe live-metingen 120 dagen vast en
-- gooit ze daarna weg. Het maandoverzicht (mig 0075) bewaart wel iets, maar
-- middelt over de dagen van een maand. Daarmee kunnen we later niet meten
-- hoeveel effect regen, een festival of een feestdag had op PRECIES die dag.
--
-- Dit dagoverzicht bewaart per zaak, per datum en per uur de gemeten drukte,
-- naast wat het Google-patroon toen zei, en per datum de omstandigheden
-- (weer, feestdag, evenementen in de buurt). Zo kunnen we straks eigen
-- factoren afleiden i.p.v. de literatuurwaarden.
--
-- Doorlopend: de rollup draait dagelijks, neemt het hele retentievenster
-- (120 dagen) mee en is idempotent (upsert). Een overgeslagen run herstelt
-- zichzelf, en de prune van de ruwe metingen draait pas als ook dit
-- overzicht gelukt is.
--
-- Klein: 24 rijen per dag per zaak (in de praktijk minder: alleen open uren),
-- dus ongeveer 9.000 rijen per zaak per jaar. Er is bewust geen prune.

create table if not exists public.busyness_daily (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  day date not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0=ma..6=zo
  hour smallint not null check (hour between 0 and 23),

  -- Mediaan van de live-metingen in dat uur.
  actual_pct numeric(5, 2),
  -- Wat het Google-weekpatroon voor dat uur zei op het moment van wegschrijven.
  expected_pct numeric(5, 2),
  -- Op hoeveel metingen de mediaan rust.
  measurements smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (business_id, day, hour)
);

comment on table public.busyness_daily is
  'Dagoverzicht van de drukte per datum en uur (mediaan van de live-metingen), naast de verwachting van het Google-patroon. Wordt dagelijks weggeschreven vóór de prune van busyness_snapshots en zelf nooit geprund.';

create index if not exists idx_busyness_daily_lookup
  on public.busyness_daily (business_id, day);

-- Omstandigheden van die dag, per zaak. Eén rij per datum.
create table if not exists public.busyness_day_context (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  day date not null,
  weekday smallint not null check (weekday between 0 and 6),

  -- Gemeten weer (Open-Meteo, WMO-code). Leeg als het niet meer op te halen was.
  weather_code smallint,
  temp_max numeric(4, 1),
  temp_min numeric(4, 1),
  -- Naam van de feestdag, als die dag er een was.
  holiday text,
  -- Evenementen in de buurt die dag: [{name, category, distanceKm}].
  events jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (business_id, day)
);

comment on table public.busyness_day_context is
  'Omstandigheden per zaak en datum (weer, feestdag, evenementen in de buurt), bij busyness_daily bewaard zodat effecten per dag te meten zijn.';

create index if not exists idx_busyness_day_context_lookup
  on public.busyness_day_context (business_id, day);

-- RLS aan zonder policies: afgeleide meetdata die alleen de service-role
-- schrijft en leest, net als busyness_monthly.
alter table public.busyness_daily enable row level security;
alter table public.busyness_day_context enable row level security;
