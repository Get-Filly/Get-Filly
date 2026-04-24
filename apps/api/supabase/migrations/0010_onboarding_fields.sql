-- ============================================================
-- Get Filly — Migratie 0010
-- Onboarding-velden op restaurants + marker voor voltooide wizard
-- ============================================================
-- Context:
--   Zodra een nieuwe eigenaar zich aanmeldt willen we 'm door een
--   onboarding-wizard leiden. Daar vult hij restaurant-basics in +
--   optioneel de URL van zijn website en een menu-kaart. Die URL
--   gebruikt Filly straks (fase B) om automatisch het profiel te
--   analyseren.
--
-- Wat hier gebeurt:
--   - website_url: nieuwe kolom voor de publieke site-URL van de zaak
--   - onboarded_at: timestamp die zegt "deze restaurant heeft de
--     wizard doorlopen". Null = nog niet klaar → dashboard stuurt
--     terug naar /onboarding.
--
-- Wat er al bestaat (uit 0003):
--   - website_summary (fase B vult 'm, Filly's analyse)
--   - website_last_analyzed_at (wanneer voor het laatst gecrawld)
--   - menu_document_url (fase C vult 'm met pad naar geuploade menukaart)
--
-- Idempotent: add column if not exists → meermaals runnen is veilig.
-- ============================================================

alter table public.restaurants
  add column if not exists website_url text,
  add column if not exists onboarded_at timestamptz;

comment on column public.restaurants.website_url is
  'Publieke URL van de restaurant-website, ingevoerd tijdens onboarding. Input voor website-crawl (fase B).';

comment on column public.restaurants.onboarded_at is
  'Timestamp wanneer de eigenaar de onboarding-wizard voltooid heeft. Null = wizard nog niet doorlopen → redirect vanuit dashboard.';

-- Een index op onboarded_at is niet nodig: we vragen 'm alleen per-id
-- op (bij het laden van het restaurant van de ingelogde user), nooit
-- als filter over alle restaurants.
