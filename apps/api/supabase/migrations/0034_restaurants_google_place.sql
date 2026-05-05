-- ============================================================
-- Migratie 0034 — restaurants.google_place_id + google_place_data
-- ============================================================
--
-- WAT EN WAAROM
-- -------------
-- Voor de Google-Business-Profile-hub (fase B uit het GBP-stappenplan)
-- moeten we per restaurant het Google Place ID kunnen opslaan plus
-- een gecachete kopie van de profiel-data uit de Places API.
--
--   * google_place_id    — unieke Google-identifier (bv. ChIJ...).
--                          Onveranderlijk voor de plek; we lookup'en
--                          'm één keer (tijdens onboarding of via een
--                          handmatige "verbind"-knop op de hub).
--
--   * google_place_data  — jsonb-cache met de laatste Places-API-respons
--                          (naam, adres, categorieën, openingstijden,
--                          rating, review-count, foto-references).
--                          Voorkomt 1 API-call per page-load. Refresh
--                          via een achtergrond-job of klant-trigger.
--
--   * google_place_synced_at — wanneer we de cache voor het laatst
--                              hebben ververst. Gebruikt om TTL te
--                              bepalen (bv. dagelijks vernieuwen).
--
-- IDEMPOTENT: gebruikt `add column if not exists` zodat heruitvoeren
-- veilig is. Migratie kan ook gerunwd worden op een DB waar het
-- veld al bestaat (bv. via een eerdere ad-hoc `alter table`).
--
-- GEEN RLS-WIJZIGING nodig: bestaande row-policies op `restaurants`
-- (uit migratie 0001/0006) gelden vanzelf voor de nieuwe kolommen.
-- ============================================================

alter table restaurants
  add column if not exists google_place_id text,
  add column if not exists google_place_data jsonb,
  add column if not exists google_place_synced_at timestamptz;

-- Index op google_place_id zodat lookups (bv. "is deze plek al door
-- iemand anders geclaimd?") snel gaan. Niet UNIQUE want in theorie
-- kunnen twee Get-Filly-accounts hetzelfde place_id claimen tijdens
-- migratie van eigenaarschap — daar handelen we apart op af in code.
create index if not exists restaurants_google_place_id_idx
  on restaurants (google_place_id)
  where google_place_id is not null;

-- Documentatie-comments op de kolommen — handig in Supabase Studio
-- en bij latere DB-tools die docs uit comments lezen.
comment on column restaurants.google_place_id is
  'Google Places API "place_id" voor deze zaak. Een keer geschreven tijdens onboarding-detect of handmatige verbind-actie. Onveranderlijk per locatie.';
comment on column restaurants.google_place_data is
  'Gecachete laatste Places-API-respons (jsonb): naam, adres, openingstijden, rating, foto-refs. Voorkomt API-call per page-load. Refresh via TTL (1 dag) of klant-trigger.';
comment on column restaurants.google_place_synced_at is
  'Wanneer google_place_data voor het laatst is ververst. NULL = nooit gesynced.';
