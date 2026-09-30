-- 0078_drop_industry.sql
-- Get-Filly is horeca-only (besluit 2026-09-29). De branche-kolom en alles
-- eromheen kan weg. Draai dit pas NA de deploy van de code die `industry`
-- niet meer leest of schrijft (expand/contract).
--
-- Het droppen van een kolom neemt de bijbehorende indexen
-- (idx_restaurants_industry, idx_cp_industry, idx_csf_industry) mee.

begin;

-- Snapshot-triggers uit mig 0067 (heette na mig 0068 set_industry_from_business).
drop trigger if exists trg_cp_industry on public.campaign_performance;
drop trigger if exists trg_csf_industry on public.campaign_style_fingerprints;
drop function if exists public.set_industry_from_business();

alter table public.campaign_performance drop column if exists industry;
alter table public.campaign_style_fingerprints drop column if exists industry;
alter table public.businesses drop column if exists industry;

commit;
