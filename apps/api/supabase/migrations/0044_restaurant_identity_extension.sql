-- ============================================================
-- 0044 — Identiteit-uitbreiding op restaurants (2026-05-21)
-- ============================================================
-- ⚠️ Schema-drift-herstel: deze kolommen draaiden al handmatig in
-- Floris' Supabase sinds 2026-05-21, maar de bijbehorende .sql was
-- nooit gecommit. Code (RestaurantUpdateSchema + de identiteit-pagina
-- in het dashboard) verwacht ze, dus een schone project-reset miste
-- ze → `PATCH /restaurant/me` faalde + de health-runner brak. Deze
-- file reproduceert ze idempotent (`if not exists`), zodat productie-
-- en dev-environments weer 1-op-1 met de code matchen.
--
-- Wat: extra "bron-van-waarheid"-velden voor Filly's posts en
-- review-replies, bovenop de basis-identiteit uit migratie 0003
-- (tagline / target_audience / atmosphere / unique_selling_points /
-- special_events). Onderverdeeld in toon, SEO en sociale-proof zodat
-- de Claude-prompts gerichter kunnen putten.
--
-- Bewerkt door de eigenaar via /dashboard/google-business/identiteit
-- en (deels) automatisch ingevuld door de WebsiteAnalyzer.
--
-- Conventie (zie 0001/0003/0019): vrije tekst = `text`, lijsten =
-- `text[]`. Alles nullable zonder default — een leeg veld betekent
-- "niet ingevuld" en Filly negeert het dan.

alter table public.restaurants
  -- ----- Toon -----
  add column if not exists tone_of_voice text,
  add column if not exists do_not_mention text,
  add column if not exists brand_story text,
  -- ----- SEO / vindbaarheid -----
  add column if not exists location_description text,
  add column if not exists keywords text[],
  add column if not exists default_hashtags text[],
  -- ----- Sociale proof / doelgroep -----
  add column if not exists awards text[],
  add column if not exists target_audience_segments text[];

comment on column public.restaurants.tone_of_voice is
  'Vrije omschrijving van de gewenste schrijftoon voor Filly''s '
  'uitingen (bv. "warm, informeel, met humor"). Max ~500 tekens '
  '(afgedwongen in RestaurantUpdateSchema).';
comment on column public.restaurants.do_not_mention is
  'Onderwerpen/woorden die Filly NIET mag noemen in posts of '
  'review-reacties (bv. concurrenten, gevoelige thema''s).';
comment on column public.restaurants.brand_story is
  'Het merkverhaal/ontstaansverhaal van de zaak; bron voor '
  'achtergrond in langere posts en de "over ons"-toon.';
comment on column public.restaurants.location_description is
  'Korte locatie-/buurtbeschrijving voor lokale SEO en context in '
  'posts (bv. "aan de gracht in de Jordaan").';
comment on column public.restaurants.keywords is
  'SEO-trefwoorden waar de zaak op gevonden wil worden; door Filly '
  'verweven in posts en gebruikt door de vindbaarheid-health-score.';
comment on column public.restaurants.default_hashtags is
  'Vaste hashtags die Filly standaard onder social-posts plaatst.';
comment on column public.restaurants.awards is
  'Prijzen/onderscheidingen/vermeldingen (Michelin, lokale awards) '
  'als sociale proof in campagnetekst.';
comment on column public.restaurants.target_audience_segments is
  'Concrete doelgroep-segmenten (bv. "zakenlunch", "gezinnen", '
  '"date-night") naast de vrije-tekst target_audience uit 0003.';
