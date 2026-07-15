-- ============================================================
-- 0064: busyness_snapshots.opening_hours — openingstijden uit de pull
-- ============================================================
-- Outscraper geeft per pull working_hours mee. Die parsen we naar onze
-- opening_hours-vorm ({ mon: {open,close}|null, ... }) en bewaren we bij
-- de snapshot. Het dashboard gebruikt dit voor de x-as van de grafiek
-- (welke uren zichtbaar zijn), zodat de grafiek exact de openingsuren
-- volgt die we óók gebruiken om te bepalen wanneer we live-metingen doen.
--
-- Bewust LOS van restaurants.opening_hours (dat is wat de eigenaar zelf
-- instelt en dat blijft leidend). Leeg bij de eigenaar -> val terug op
-- deze uit de pull. Zo conflicteren de twee inputs niet.

alter table public.busyness_snapshots
  add column if not exists opening_hours jsonb;
