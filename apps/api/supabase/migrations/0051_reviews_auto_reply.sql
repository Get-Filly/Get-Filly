-- ============================================================
-- Migratie 0051: reviews auto-reply + reviews-tone
-- ============================================================
-- Voegt 3 kolommen toe aan restaurants voor de auto-reageren-feature
-- op reviews:
--   - reviews_auto_reply_enabled : staat de feature aan?
--   - reviews_auto_reply_mode    : 'concept' (Filly maakt een concept-
--                                   reactie ter goedkeuring) of 'publish'
--                                   (Filly plaatst de reactie zelf).
--                                   'publish' wordt pas bruikbaar zodra
--                                   de Google Business Profile OAuth live
--                                   is (fase E) — tot dan dwingt de UI
--                                   'concept' af.
--   - reviews_tone_of_voice      : eigen toon voor reviews-reacties.
--                                   Leeg = valt terug op de algemene
--                                   restaurants.tone_of_voice.
--
-- Geen RLS-wijziging: dit zijn kolommen op de bestaande restaurants-
-- tabel die al onder user_has_restaurant_access valt.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS reviews_auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reviews_auto_reply_mode TEXT NOT NULL DEFAULT 'concept',
  ADD COLUMN IF NOT EXISTS reviews_tone_of_voice TEXT;

-- CHECK i.p.v. een enum-type zodat we de mode later makkelijk kunnen
-- uitbreiden zonder type-migratie.
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_reviews_auto_reply_mode_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_reviews_auto_reply_mode_check
  CHECK (reviews_auto_reply_mode IN ('concept', 'publish'));

COMMENT ON COLUMN restaurants.reviews_auto_reply_enabled IS
  'Filly genereert/plaatst automatisch reacties op nieuwe reviews onder de low_review_threshold.';
COMMENT ON COLUMN restaurants.reviews_auto_reply_mode IS
  'concept = ter goedkeuring klaarzetten; publish = zelf plaatsen (vereist GBP OAuth, fase E).';
COMMENT ON COLUMN restaurants.reviews_tone_of_voice IS
  'Eigen toon voor reviews-reacties; leeg = fallback op restaurants.tone_of_voice.';
