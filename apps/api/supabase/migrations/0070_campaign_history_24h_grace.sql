-- 0070_campaign_history_24h_grace.sql
-- Campagne-historie krijgt een 24u-grace (Floris 2026-08-06): een geplaatste
-- campagne blijft 24u zichtbaar op het bord en zakt daarna naar historie.
--
-- Twee wijzigingen t.o.v. mig 0043:
--   1. Conditie: archiveer pas als scheduled_for MEER dan 24u geleden is
--      (was: zodra scheduled_for < now()).
--   2. Frequentie: uurlijks i.p.v. dagelijks, zodat de overgang op ~1u
--      nauwkeurig rond het 24u-moment gebeurt i.p.v. tot een dag later.
--
-- De frontend (kanban + history-pagina) en de backend restore-gate hanteren
-- dezelfde 24u-regel, dus DB-status en weergave lopen synchroon.

-- 1. Functie: 24u-grace op scheduled_for.
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
    and scheduled_for < now() - interval '24 hours';
end;
$$;

comment on function public.cleanup_expired_campaigns is
  'Migreert campagnes waarvan scheduled_for >24u geleden is naar status=afgerond (24u-historie-grace). Aangeroepen door pg_cron-job ''cleanup_expired_campaigns'' (uurlijks). Idempotent: skipt al-afgeronde + verwijderde rijen.';

-- 2. Herplan uurlijks (was 17 3 * * *). Idempotent: eerst unschedule.
do $$
begin
  perform cron.unschedule('cleanup_expired_campaigns');
exception
  when others then
    null; -- job bestond niet, prima
end$$;

-- Elk uur op :17 (spreiding weg van het hele uur).
select cron.schedule(
  'cleanup_expired_campaigns',
  '17 * * * *',
  $$select public.cleanup_expired_campaigns();$$
);
