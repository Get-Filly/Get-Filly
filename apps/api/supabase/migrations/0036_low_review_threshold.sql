-- ============================================================
-- 0036_low_review_threshold.sql
-- Per-restaurant drempel: vanaf welke sterren-rating telt een
-- review als "lage review" en moet 'ie in de actie-strip verschijnen.
-- ============================================================
--
-- Voorheen hardcoded `rating <= 3` in TasksStrip. Sommige
-- ondernemers zijn strikter (alles <= 4 wil ik nazien) of
-- juist soepeler (alleen 1-2 sterren).
--
-- Default 3 = bestaand gedrag bewaard, geen migratie-shock voor
-- live klanten.
--
-- Range 1-5 met CHECK-constraint: voorkomt dat een eigenaar per
-- ongeluk 6 of 0 doorgeeft. Bij 5 verschijnen ALLE reviews als actie
-- (niet aan te raden maar mag), bij 1 alleen 1-sters.

alter table public.restaurants
  add column if not exists low_review_threshold smallint not null default 3
  check (low_review_threshold between 1 and 5);

comment on column public.restaurants.low_review_threshold is
  'Drempel waarbij reviews als "lage review" worden gemarkeerd (1-5). '
  'Reviews met rating <= deze waarde verschijnen in de overige-acties-'
  'strip op /dashboard/campagnes. Default 3.';
