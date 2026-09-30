-- ============================================================
-- 0081: weer per uur in het dagoverzicht (busyness_day_context)
-- ============================================================
-- De rustige-momenten-detectie kijkt naar het weer over het voorgestelde
-- tijdvenster (2 uur), niet meer naar het daggemiddelde. Om dat later te
-- kunnen toetsen bewaren we ook het weer per uur bij de gemeten drukte:
-- {"temp": [24 waarden], "code": [24 waarden]}, index = uur van de dag,
-- null als een uur ontbrak. De dagwaarden (weather_code, temp_max, temp_min)
-- blijven staan.
alter table public.busyness_day_context
  add column if not exists weather_hourly jsonb;

comment on column public.busyness_day_context.weather_hourly is
  'Gemeten weer per uur van die dag: {"temp": [24], "code": [24]} (WMO-code), index = uur; null waar een uur ontbrak. Voor het toetsen van de weersfactoren per tijdvenster.';
