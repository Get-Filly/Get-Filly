-- ============================================================
-- 0062: busyness_snapshots — drukte-metingen per restaurant
-- ============================================================
-- Bron achter de getBusyness-naad (dashboard-grafiek). Gevuld door de
-- Outscraper-koppeling (Google "Populaire tijden"), niet door Google's
-- officiele API — die levert geen populaire tijden. Zie BACKLOG +
-- de memory getfilly-outscraper-parser voor de exacte responsvorm.
--
-- Twee soorten data in dit model:
--   * VERWACHT  = Google's typische weekpatroon (pattern, 7x24). Komt
--                 mee bij de wekelijkse volledige pull. Vervangt de
--                 seed-BASE24 in busyness.ts.
--   * WERKELIJK = opgebouwd uit vele live-metingen (live_pct) op
--                 captured_at. werkelijk[weekdag][uur] = mediaan van
--                 de live_pct-waarden in die cel (mediaan tegen
--                 uitschieters). Google geeft geen historische per-dag
--                 data, alleen "nu" -> daarom accumuleren we zelf.
--
-- Niet-gedeelde, restaurant-gescopete data. Alleen de service-role
-- (Outscraper-cron + Nest-backend) leest/schrijft hier; de web
-- benadert dit via de Nest-API, niet rechtstreeks. Geen policies nodig.
--
-- LET OP: als er van een eerdere experiment-ronde al een lege
-- busyness_snapshots-tabel staat met een andere vorm, draai dan eerst
-- (alleen als 'ie leeg is!):
--   drop table if exists public.busyness_snapshots cascade;

create table if not exists public.busyness_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id) on delete cascade,

  -- Welke Google-plek gescrapet is (herleidbaarheid + defense-in-depth
  -- naast restaurant_id). = restaurants.google_place_id op scrapemoment.
  place_id text,
  source text not null default 'outscraper',

  -- Moment van scrapen (UTC). De live_*-velden zijn al naar
  -- Europe/Amsterdam omgerekend zodat weekdag/uur kloppen.
  captured_at timestamptz not null default now(),

  -- VERWACHT: Google's typische weekpatroon. Array van 7 (ma..zo), elk
  -- 24 getallen (uur 0-23) = drukte-% 0-100. Uren buiten Google's
  -- bereik (0-5) staan op 0. Alleen gevuld bij de wekelijkse volledige
  -- pull; live-only metingen laten dit null.
  pattern jsonb,

  -- LIVE: Google's "nu"-drukte op captured_at, indien aanwezig
  -- (Outscraper geeft dit als laatste element {day:"live", ...}).
  live_pct smallint,
  live_hour smallint,     -- 0-23 (Europe/Amsterdam)
  live_weekday smallint,  -- 0=ma .. 6=zo (Europe/Amsterdam)

  -- Volledige ruwe Outscraper-rij, voor debugging/herverwerking zonder
  -- opnieuw te hoeven scrapen.
  raw jsonb,

  created_at timestamptz not null default now(),

  constraint busyness_live_pct_range
    check (live_pct is null or (live_pct >= 0 and live_pct <= 100)),
  constraint busyness_live_hour_range
    check (live_hour is null or (live_hour >= 0 and live_hour <= 23)),
  constraint busyness_live_weekday_range
    check (live_weekday is null or (live_weekday >= 0 and live_weekday <= 6))
);

-- Laatste pattern per restaurant (verwacht = meest recente snapshot
-- met een gevuld pattern).
create index if not exists idx_busyness_latest
  on public.busyness_snapshots (restaurant_id, captured_at desc);

-- Live-metingen aggregeren tot "werkelijk" per weekdag+uur.
create index if not exists idx_busyness_live
  on public.busyness_snapshots (restaurant_id, live_weekday, live_hour)
  where live_pct is not null;

alter table public.busyness_snapshots enable row level security;
