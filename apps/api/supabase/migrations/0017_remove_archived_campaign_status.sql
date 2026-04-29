-- ============================================================
-- 0017 — Status 'gearchiveerd' afschaffen
-- ============================================================
-- We schaffen het concept 'gearchiveerd' af bij campagnes. Dit was
-- bedoeld om afgeronde/oude campagnes uit het zicht te halen, maar
-- in de praktijk verwart het meer dan dat het helpt: 'afgerond' was
-- conceptueel al "klaar/geschiedenis", 'gearchiveerd' was een lege
-- extra-laag.
--
-- Wijzigingen:
--   1. Bestaande 'gearchiveerd'-rijen → 'afgerond' (worden weer
--      bruikbaar in de UI; eigenaar kan ze opnieuw inplannen).
--   2. CHECK-constraint op campaigns.status vernauwen tot 4 waarden:
--      'concept', 'ingepland', 'actief', 'afgerond'.
--
-- Backwards-compat: backend laat geen status='gearchiveerd' meer
-- toe via updateStatus, dus na deze migratie kan deze waarde niet
-- meer voorkomen in de tabel.

-- 1) Migreer bestaande rijen.
update public.campaigns
   set status = 'afgerond'
 where status = 'gearchiveerd';

-- 2) Drop de oude inline CHECK-constraint. De naam is door Postgres
--    auto-gegenereerd (bv. campaigns_status_check) — we zoeken 'm
--    op via pg_constraint zodat dit script werkt ongeacht de
--    exacte naam in de huidige DB.
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'campaigns'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%gearchiveerd%';

  if v_conname is not null then
    execute format('alter table public.campaigns drop constraint %I', v_conname);
  end if;
end $$;

-- 3) Nieuwe CHECK met de 4 overgebleven statussen.
alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('concept', 'ingepland', 'actief', 'afgerond'));
