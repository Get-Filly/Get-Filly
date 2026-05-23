-- 0045_health_scores.sql
-- Vindbaarheid-health-score: snapshots, bevindingen, concurrenten.
-- Live in Floris' Supabase per 2026-05-23 (in-Studio gerund); deze file
-- is voor productie-environments + andere developers.

-- ============================================================
-- 1. health_scores: een snapshot per audit-run per restaurant.
--    De totale en sub-scores zijn altijd 0-100 (smallint volstaat).
-- ============================================================
create table public.health_scores (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Hoofdcijfer + sub-scores per categorie
  score_total   smallint not null check (score_total   between 0 and 100),
  score_seo     smallint not null check (score_seo     between 0 and 100),
  score_gbp     smallint not null check (score_gbp     between 0 and 100),
  score_reviews smallint not null check (score_reviews between 0 and 100),
  score_geo     smallint not null check (score_geo     between 0 and 100),

  -- Meta over de run zelf
  ran_at          timestamptz not null default now(),
  run_duration_ms integer,
  run_source      text not null default 'manual' check (run_source in ('manual','cron','onboarding')),

  -- Versie van het score-model; zo kunnen we historische data correct interpreteren
  -- als we later gewichten of checks wijzigen.
  runner_version  text not null default 'v1'
);

create index idx_health_scores_restaurant_ran on public.health_scores(restaurant_id, ran_at desc);

alter table public.health_scores enable row level security;
create policy "health_scores_access" on public.health_scores
  for all using (public.user_has_restaurant_access(restaurant_id));


-- ============================================================
-- 2. health_findings: individuele checks per run.
--    restaurant_id staat ook hier (denormalized) zodat RLS dezelfde
--    helper-functie kan gebruiken als de rest van het schema.
-- ============================================================
create table public.health_findings (
  id uuid primary key default gen_random_uuid(),
  health_score_id uuid not null references public.health_scores(id) on delete cascade,
  restaurant_id   uuid not null references public.restaurants(id)   on delete cascade,

  -- Welke categorie en welke specifieke check
  category  text not null check (category in ('seo','gbp','reviews','geo')),
  check_key text not null,

  -- Resultaat + impact
  passed       boolean  not null,
  severity     text     not null check (severity in ('info','low','medium','high','critical')),
  points_lost  smallint not null default 0 check (points_lost between 0 and 100),

  -- UI-content (door runner gegenereerd, NL)
  title           text not null,
  description     text,
  fix_suggestion  text,
  fix_link        text,

  -- Rauwe meetwaarden voor debug en latere analyses
  details jsonb,

  created_at timestamptz not null default now()
);

create index idx_health_findings_score on public.health_findings(health_score_id);
create index idx_health_findings_score_category on public.health_findings(health_score_id, category);

alter table public.health_findings enable row level security;
create policy "health_findings_access" on public.health_findings
  for all using (public.user_has_restaurant_access(restaurant_id));


-- ============================================================
-- 3. health_competitors: top concurrenten in 500m straal per run.
--    Scores nullable: we draaien SEO/GEO niet op concurrenten (te duur
--    in quota), alleen GBP+Reviews op basis van Places-data.
-- ============================================================
create table public.health_competitors (
  id uuid primary key default gen_random_uuid(),
  health_score_id uuid not null references public.health_scores(id) on delete cascade,
  restaurant_id   uuid not null references public.restaurants(id)   on delete cascade,

  -- Identificatie bij Google Places (geen FK; geen eigen tabel)
  place_id text not null,
  name     text not null,

  -- Afstand t.o.v. het eigen restaurant in meters
  distance_m integer not null check (distance_m between 0 and 1000),

  -- Zelfde sub-scores als eigen restaurant; nullable (zie boven)
  score_total   smallint check (score_total   between 0 and 100),
  score_gbp     smallint check (score_gbp     between 0 and 100),
  score_reviews smallint check (score_reviews between 0 and 100),

  -- Rauwe Places-data (rating, review_count, adres, foto-refs) voor de UI
  raw_data jsonb,

  -- 1 = sterkste concurrent in de straal
  rank_in_radius smallint not null check (rank_in_radius between 1 and 20)
);

create index idx_health_competitors_score_rank on public.health_competitors(health_score_id, rank_in_radius);

alter table public.health_competitors enable row level security;
create policy "health_competitors_access" on public.health_competitors
  for all using (public.user_has_restaurant_access(restaurant_id));
