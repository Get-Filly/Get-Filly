-- ============================================================
-- 0085: kennisbank "wat werkt" (intern, klant ziet dit nooit)
-- ============================================================
-- Vier lagen: bron -> ruwe import (elke vorm) -> genormaliseerde meting ->
-- berekend inzicht. RLS staat aan zonder policies: alleen de service-role
-- (onze backend en scripts) kan erbij.
-- Bewust GEEN kolom voor namen van bedrijven of accounts.
-- ============================================================

create table if not exists public.kb_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  publisher text,
  kind text not null default 'anders'
    check (kind in ('studie','rapport','blog','dataset','eigen','anders')),
  commercial_use text not null default 'onbekend'
    check (commercial_use in ('ja','nee','onbekend')),
  reliability smallint not null default 2 check (reliability between 1 and 3),
  retrieved_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_raw_imports (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.kb_sources(id) on delete cascade,
  filename text,
  format text not null default 'json',
  payload jsonb not null,            -- lijst rijen, precies zoals aangeleverd
  mapping jsonb,                     -- hoe deze import is genormaliseerd
  row_count integer not null default 0,
  status text not null default 'nieuw' check (status in ('nieuw','genormaliseerd','fout')),
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.kb_sources(id) on delete cascade,
  import_id uuid references public.kb_raw_imports(id) on delete cascade,
  channel text not null,
  format text,
  topic text,
  country text,
  region text,
  weekday smallint check (weekday between 0 and 6),
  daypart text,
  season text,
  metric text not null,
  unit text,
  value numeric not null,
  sample_size integer,
  period_end date,
  created_at timestamptz not null default now()
);
create index if not exists idx_kb_obs_channel on public.kb_observations(channel, metric);
create index if not exists idx_kb_obs_import on public.kb_observations(import_id);

create table if not exists public.kb_insights (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  dimension text not null check (dimension in ('format','topic','daypart')),
  dimension_value text not null,
  metric text not null,
  unit text,
  lift numeric not null,            -- 0.35 = 35% boven gemiddeld
  n_observations integer not null,
  n_sources integer not null,
  total_sample integer not null default 0,
  confidence text not null check (confidence in ('laag','midden','hoog')),
  computed_at timestamptz not null default now()
);
create index if not exists idx_kb_insights_channel on public.kb_insights(channel);

alter table public.kb_sources enable row level security;
alter table public.kb_raw_imports enable row level security;
alter table public.kb_observations enable row level security;
alter table public.kb_insights enable row level security;
