-- ============================================================
-- 0054: events-voorkeuren per restaurant
-- ============================================================
-- De eigenaar bepaalt op de account-pagina welke event-typen Filly
-- meeneemt in voorstellen en binnen welke afstand. EventsService
-- leest deze kolommen bij het bouwen van het EVENEMENTEN IN DE
-- BUURT-blok.

alter table public.restaurants
  -- Welke categorieën meetellen (festivals / concerten_theater /
  -- events / sportevenementen / kermis / markten).
  --   null  = alle categorieën (default)
  --   '{}'  = events volledig uit voor deze zaak
  add column if not exists event_categories text[] default null,
  -- Vaste maximale afstand in km voor álle typen.
  --   null = slimme staffel per type (markt/kermis 2, concert/sport 5,
  --          festival 10 km) — de default.
  add column if not exists event_max_distance_km integer default null;
