-- ============================================================
-- 0081: weer per uur (dagoverzicht) + weer-opnames (vier per dag)
-- ============================================================
-- 1. busyness_day_context.weather_hourly: het gemeten weer per uur bij de
--    gemeten drukte, om de weersfactoren per tijdvenster te kunnen toetsen.
-- 2. weather_forecasts: de laatste weersverwachting per locatie, vier keer per
--    dag vernieuwd (ochtend, lunch, middag, diner). De rustige-momenten-
--    detectie leest deze opname en roept Open-Meteo niet meer live aan.

alter table public.busyness_day_context
  add column if not exists weather_hourly jsonb;

comment on column public.busyness_day_context.weather_hourly is
  'Gemeten weer per uur van die dag: {"temp": [24], "code": [24]} (WMO-code), index = uur; null waar een uur ontbrak. Voor het toetsen van de weersfactoren per tijdvenster.';

create table if not exists public.weather_forecasts (
  -- Locatie op twee decimalen (ongeveer 1 km), bv. '52.37,4.90'. Zaken in
  -- dezelfde straat delen een opname.
  location_key text primary key,
  -- Bij welk dagdeel deze opname is genomen: ochtend, lunch, middag of diner.
  slot text not null check (slot in ('ochtend', 'lunch', 'middag', 'diner')),
  captured_at timestamptz not null default now(),
  -- {"2026-10-05": {"temp": [24 waarden], "code": [24 waarden]}, ...}
  -- 7 dagen vooruit, per uur; null waar een uur ontbrak.
  forecast jsonb not null
);

comment on table public.weather_forecasts is
  'Laatste uurverwachting (7 dagen) per locatie, vier keer per dag vernieuwd door de weer-cron. Alleen de laatste opname blijft staan.';

-- RLS aan zonder policies: afgeleide data die alleen de service-role schrijft
-- en leest, net als busyness_monthly.
alter table public.weather_forecasts enable row level security;
