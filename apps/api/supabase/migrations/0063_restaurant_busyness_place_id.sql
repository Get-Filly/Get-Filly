-- ============================================================
-- 0063: restaurants.busyness_place_id — drukte-bron los van GBP
-- ============================================================
-- De busyness-koppeling (Outscraper "Populaire tijden") gebruikte tot nu
-- restaurants.google_place_id, maar dat veld is óók de Google Business
-- Profile-koppeling (reviews/profiel/health). Dat wil je gescheiden
-- houden: een demo-zaak mag drukte-data van een échte zaak lenen zonder
-- dat de GBP-integratie mee verandert.
--
-- Daarom een eigen veld. De busyness-service leest:
--   busyness_place_id  →  anders terugval op google_place_id
-- zodat echte klanten (met een gekoppeld GBP) automatisch hun eigen
-- drukte krijgen, terwijl een demo expliciet naar een andere plek kan
-- wijzen zonder GBP aan te raken.

alter table public.restaurants
  add column if not exists busyness_place_id text;

comment on column public.restaurants.busyness_place_id is
  'Google place_id voor de drukte-bron (Outscraper populaire tijden), los van google_place_id (GBP). Leeg = val terug op google_place_id.';
