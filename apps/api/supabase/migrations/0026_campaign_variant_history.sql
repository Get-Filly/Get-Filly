-- ============================================================
-- Get Filly — Migratie 0026
-- variant_applied_at + scheduling_history
-- ============================================================
-- Twee gerelateerde wijzigingen aan campaigns:
--
-- 1. variant_applied_at — markeert dat de eigenaar een Filly-variant
--    heeft toegepast op de campagne. Daarna verbergt de UI de
--    "Met Filly bewerken"-sectie zodat 'ie niet oneindig nieuwe
--    alternatieven kan genereren binnen 1 campagne (kostencontrole +
--    flow-helderheid: keuze is gemaakt, klaar).
--
-- 2. scheduling_history — array van eerder gegenereerde tijdstip-
--    voorstellen. Gebruikt door "Andere suggestie"-knop:
--    - Eerste 2 kliks: nieuwe Claude-call, current naar history
--    - Daarna: cyclen door history zonder Claude-call (bron: B-optie
--      uit ontwerp-keuze 2026-04-30 — max 3 unieke alternatieven,
--      daarna round-robin door geschiedenis).
-- ============================================================

alter table public.campaigns
  add column if not exists variant_applied_at timestamptz,
  add column if not exists scheduling_history jsonb default '[]'::jsonb;

comment on column public.campaigns.variant_applied_at is
  'Tijdstip waarop de eigenaar voor het laatst een Filly-variant op deze campagne heeft toegepast. Null = nog geen variant gekozen. UI gebruikt dit om de "Met Filly bewerken"-sectie te verbergen.';

comment on column public.campaigns.scheduling_history is
  'Array van eerder gegenereerde tijdstip-voorstellen, oudste eerst. Elk element: { datetime_iso, reasoning, generated_at }. Wordt gebruikt door de "Andere suggestie"-knop om door eerdere voorstellen te cyclen i.p.v. elke klik een nieuwe Claude-call.';
