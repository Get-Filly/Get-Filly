-- ============================================================
-- 0060 — Schema-cleanup: legacy variant-cache-kolommen op CAMPAIGNS droppen
-- ============================================================
-- Dit is de "Mig 0043: DB-schema cleanup" uit de BACKLOG. Het nummer
-- 0043 was al bezet (auto-archive), dus deze cleanup krijgt het eerste
-- vrije nummer (0060).
--
-- Sinds mig 0041 is campaigns.variants[] + selected_variant_index de
-- bron-van-waarheid voor de versies-grid op de unified-detail-page. De
-- oude /refine-flow en bijbehorende kolommen zijn uitgefaseerd:
--   - lees-endpoints (GET :id/variants, POST :id/refine) verwijderd
--   - write-paden weg: de create-seed (filly_variants) en het oude
--     PATCH :id (from_variant → variant_applied_at)
-- Deze drie kolommen worden dus nergens meer gelezen of geschreven.
--
-- ⚠️ DEPLOY-VOLGORDE (expand/contract): draai deze DROP PAS NÁDAT de
-- code die niet meer naar deze kolommen schrijft live staat. Draai je
-- 'm eerder, dan breken campagne-inserts op een niet-bestaande kolom.
--
-- LET OP: dit raakt ALLEEN public.campaigns. De gelijknamige kolommen op
-- public.reviews (reviews.filly_variants / filly_variants_regen_count)
-- blijven in gebruik door de review-reply-varianten-flow en worden hier
-- NIET gedropt.

alter table public.campaigns
  drop column if exists filly_variants,
  drop column if exists filly_variants_regen_count,
  drop column if exists variant_applied_at;
