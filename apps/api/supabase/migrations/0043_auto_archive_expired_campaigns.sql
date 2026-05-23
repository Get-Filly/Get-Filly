-- ============================================================
-- Get Filly — Migratie 0043
-- Verstreken campagnes automatisch naar 'afgerond' (pg_cron job)
-- ============================================================
-- Achtergrond:
--   Per 2026-05-21 (Floris-feedback): zodra een campagne's
--   scheduled_for in het verleden ligt moet hij naar de historie,
--   ongeacht in welke fase hij staat (voorstel/concept/ingepland/
--   actief). Geen handmatige actie nodig.
--
--   Reden: zonder auto-archive blijft een vergeten "ingepland"-
--   campagne maandenlang in de kanban staan met een ondertussen
--   verstreken datum. Op schaal (1000+ klanten) wordt dat een
--   onleesbare puinhoop.
--
-- Strategie:
--   1. SECURITY DEFINER-functie cleanup_expired_campaigns die de
--      UPDATE doet. SECURITY DEFINER zodat pg_cron 'm kan draaien
--      onder postgres-rol, los van per-user RLS.
--   2. pg_cron job die de functie elke nacht om 03:17 UTC draait
--      (zelfde tijdslot-conventie als migratie 0035 chat-cleanup;
--      zo zijn alle DB-maintenance jobs op één momentum).
--
-- Frontend-context:
--   - /campagnes kanban filtert verstreken-niet-afgerond OOK
--     read-time uit zodat eigenaar geen 1-dag-gap ziet tussen
--     verstrijken en de nachtelijke job.
--   - /campagnes/history toont OOK verstreken-niet-afgerond
--     (zelfde defense-in-depth).
--   - De cron is dus puur voor schone DB-state, niet voor UI.
--
-- pg_cron scope-uitzondering:
--   Per project-memory "feedback_getfilly_no_cron": Filly's
--   auto-suggesties NIET via interne cron, alleen event-driven
--   vanuit reserveringsplatform. Maar DB-maintenance via pg_cron
--   is expliciet toegestaan (zelfde uitzondering die 0035 gebruikt).
--   Deze migratie valt onder die uitzondering.
-- ============================================================

-- ============================================================
-- 1. Cleanup-functie
-- ============================================================
-- Update alle campagnes waar:
--   - scheduled_for in het verleden ligt
--   - status NIET al 'afgerond' is (idempotent — geen onnodige writes)
--   - deleted_at NULL is (verwijderde rijen niet "afronden")
-- Geen exceptions wanneer er 0 rijen zijn; geen ROW COUNT-check
-- nodig. updated_at meeschrijven zodat audit-trails kloppen.
create or replace function public.cleanup_expired_campaigns()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set
    status = 'afgerond',
    updated_at = now()
  where status <> 'afgerond'
    and deleted_at is null
    and scheduled_for is not null
    and scheduled_for < now();
end;
$$;

comment on function public.cleanup_expired_campaigns is
  'Migreert verstreken niet-afgeronde campagnes naar status=afgerond. Aangeroepen door pg_cron-job daily om 03:17 UTC. Idempotent: skipt al-afgeronde + verwijderde rijen.';

-- ============================================================
-- 2. pg_cron schedule
-- ============================================================
-- Idempotent: drop bestaande job met dezelfde naam vóór create
-- zodat her-runnen van deze migratie geen duplicate-job geeft.
-- (pg_cron.schedule faalt als jobname al bestaat.)
do $$
begin
  perform cron.unschedule('cleanup_expired_campaigns');
exception
  when others then
    -- Job bestaat niet, prima — eerste run.
    null;
end$$;

-- 03:17 UTC = 04:17 of 05:17 NL-tijd (winter/zomer), buiten openings-
-- uren van vrijwel alle horeca → veilig moment voor maintenance.
select cron.schedule(
  'cleanup_expired_campaigns',
  '17 3 * * *',
  $$select public.cleanup_expired_campaigns();$$
);
