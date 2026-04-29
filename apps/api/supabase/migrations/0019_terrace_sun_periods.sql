-- ============================================================
-- 0019 — Terras-zon: wanneer schijnt de zon op het terras?
-- ============================================================
-- Filly gebruikt dit voor weer-getriggerde campagnes. Als het
-- zonnig is in de middag én het terras heeft middag-zon →
-- voorstel een terras-actie. Zonder dit veld kan Filly alleen
-- generieke "het wordt mooi weer"-mailings doen.
--
-- Waarden:
--   - 'morning'   (ca. 7:00–12:00)
--   - 'afternoon' (ca. 12:00–17:00)
--   - 'evening'   (ca. 17:00–21:00)
--
-- Array zodat een terras met "middag + avond zon" gewoon beide
-- mag. Nullable: alleen relevant als has_terrace=true. Voor
-- restaurants zonder terras blijft het null en negeert Filly 't.

alter table public.restaurants
  add column if not exists terrace_sun_periods text[];
