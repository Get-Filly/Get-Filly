-- ============================================================
-- Get Filly — Migratie 0012
-- ai_usage.restaurant_id nullable maken voor pre-onboarding calls
-- ============================================================
-- Probleem:
--   Tijdens onboarding (website-analyse, menu-Vision) heeft de user
--   nog geen restaurant. AiService logt elke Claude-call in ai_usage
--   met fire-and-forget; de insert faalt dan op de FK omdat restaurant_id
--   NOT NULL is. Gevolg: we missen usage-tracking voor exact het
--   duurste gedeelte (Opus 4.7 Vision-calls tijdens onboarding).
--
-- Oplossing:
--   restaurant_id nullable maken. null = "pre-onboarding". De FK blijft
--   bestaan maar wordt alleen afgedwongen als restaurant_id gevuld is.
--
-- Impact:
--   Bestaande rijen blijven gevuld (geen data-loss). Analytics-queries
--   die per restaurant groeperen negeren de null-rijen automatisch via
--   where restaurant_id is not null. Nieuwe dashboards kunnen de
--   null-rijen apart tellen als "pre-onboarding AI-verbruik".
-- ============================================================

alter table public.ai_usage
  alter column restaurant_id drop not null;

comment on column public.ai_usage.restaurant_id is
  'FK naar restaurants. NULL = pre-onboarding call (bv. website-analyse of menu-Vision tijdens wizard, user heeft nog geen restaurant). Filter daar bewust op in dashboards.';
