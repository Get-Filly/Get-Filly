-- ============================================================
-- Migratie 0027 — target_weekday_occupancy_pct
-- ============================================================
--
-- Voegt een eigenaar-instelbaar doel toe voor doordeweekse bezetting.
--
-- Achtergrond: het dashboard toont een KPI "weekday avg occupancy %"
-- die tot nu toe hard-coded op 68 stond (zie kpi.service.ts). Per
-- 2026-04-30 berekent KpiService het echte 6-maanden-gemiddelde uit
-- occupancy_history. Maar:
--   - Bij een nieuwe klant is er nog geen historie → val terug op 68.
--   - Sommige eigenaars willen sturen op een doel (bv. "ik wil 75%
--     halen") i.p.v. zien wat het was. Voor hen: deze override.
--
-- Cascade in KpiService.weekdayAvgPct():
--   1. target_weekday_occupancy_pct gezet → return die.
--   2. ≥30 dagen historie aanwezig → return 6-maanden-aggregaat.
--   3. Anders → return 68 (legacy fallback voor lege accounts).
--
-- Bewust integer (niet numeric): we tonen de KPI als heel getal en
-- 0.5%-precisie heeft geen meerwaarde voor een doel-instelling.
-- ============================================================

alter table public.restaurants
  add column if not exists target_weekday_occupancy_pct integer
    check (target_weekday_occupancy_pct between 0 and 100);

comment on column public.restaurants.target_weekday_occupancy_pct is
  'Optioneel doel voor doordeweekse bezetting (0-100). Null = gebruik 6-maanden-historie of fallback 68.';
