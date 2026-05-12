-- ============================================================
-- 0037_low_occupancy_threshold.sql
-- Per-restaurant drempel: vanaf welk bezetting-percentage telt een
-- dag als "rustig" en verschijnt 'ie in de overige-acties-strip
-- op /dashboard/campagnes.
-- ============================================================
--
-- Voorheen hardcoded `occupancy_pct < 50` in TasksStrip. Wat
-- "rustig" is verschilt per zaak:
--   - Buurtcafé met 80% wekelijks gemiddelde → 60% voelt rustig
--   - Fine-dining met 35% gemiddelde → alleen <25% telt als zorg
--
-- Default 50% = bestaand gedrag bewaard.
--
-- Range 10-100 met CHECK-constraint. Bij 100 verschijnt elke dag
-- die niet UITverkocht is (niet handig maar mag), bij 10 alleen
-- echte spook-dagen.

alter table public.restaurants
  add column if not exists low_occupancy_threshold smallint not null default 50
  check (low_occupancy_threshold between 10 and 100);

comment on column public.restaurants.low_occupancy_threshold is
  'Drempel waarbij een dag als "rustig" wordt gemarkeerd (10-100). '
  'Dagen met occupancy_pct < deze waarde verschijnen in de overige-'
  'acties-strip op /dashboard/campagnes. Default 50.';
