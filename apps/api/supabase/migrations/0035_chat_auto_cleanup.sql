-- ============================================================
-- 0035_chat_auto_cleanup.sql
-- Auto-delete chat-conversaties ouder dan 7 dagen (vanaf created_at)
-- ============================================================
--
-- WAAROM created_at en niet updated_at?
-- We willen NIET dat een chat eindeloos doorettert. Hoe langer een
-- conversatie loopt, hoe meer kans op:
--   - hallucinaties die gestapeld worden ("Filly zei eerder dat...")
--   - ongewenste keuzes die in de context blijven hangen
-- Door op created_at te tellen, dwingt de cleanup eigenaars om elke
-- week opnieuw te beginnen met een schone lei. Filly's leerschat zit
-- veilig in `restaurant_chat_memory` (overleeft de delete).
--
-- WAAROM pg_cron en geen Nest/Vercel-cron?
-- De project-regel "geen interne cron-jobs" gaat over Filly's
-- suggesties-flow (zie memory project_getfilly_no_cron). Voor pure
-- DB-maintenance is pg_cron de juiste plek: draait Postgres-side,
-- geen app-infra, voorspelbaar 1x per dag, schaalt naar 1000+ tenants.
--
-- WAAROM geen memory-summary vóór delete?
-- Een chat die 7 dagen onaangeraakt is, is "afgekoeld". De handmatige
-- delete-knop in de UI roept WEL summarizeAndSave aan (Claude-call),
-- maar pg_cron kan geen Claude aanroepen. Bewuste trade-off: bij
-- auto-cleanup gaan ongesynthetiseerde leerpunten verloren.
-- Toekomstige feature: Filly leert primair uit GEACCEPTEERDE
-- campagnes (ai_suggestions met status='approved'), niet uit chat-
-- history. Dat is een eigen iteratie.

-- ============================================================
-- 1. Extensie aanzetten
-- ============================================================
-- pg_cron staat op Supabase in het `extensions`-schema. Idempotent:
-- als 'ie al aanstaat doet 'create extension if not exists' niets.
create extension if not exists pg_cron with schema extensions;

-- ============================================================
-- 2. Cleanup-functie
-- ============================================================
-- security definer: draait als eigenaar van de functie (postgres-role),
-- bypassed RLS zodat de job over alle tenants kan opruimen.
-- set search_path: voorkomt search_path-injection-aanval (security
-- hardening, standaard Supabase-best-practice voor definer-functies).
create or replace function public.cleanup_old_chat_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- Delete cascadet automatisch naar:
  --   - chat_messages (FK on delete cascade, mig 0001)
  --   - restaurant_chat_memory.source_conversation_id (set null, mig 0028)
  -- ai_suggestions.chat_message_id wordt via chat_messages-cascade
  -- ook op null gezet, suggesties zelf blijven bestaan.
  delete from public.chat_conversations
  where created_at < now() - interval '7 days';

  get diagnostics deleted_count = row_count;

  -- Log naar Postgres-log zodat we via Supabase-dashboard kunnen zien
  -- of de job draait en hoeveel rijen 'ie ruimt. Geen losse audit-
  -- tabel: dit is pure maintenance, niet business-relevant.
  raise notice 'cleanup_old_chat_conversations: % conversaties verwijderd', deleted_count;

  return deleted_count;
end;
$$;

comment on function public.cleanup_old_chat_conversations() is
  'Verwijdert chat_conversations ouder dan 7 dagen (created_at). '
  'Aangeroepen door pg_cron job ''cleanup_old_chat_conversations''. '
  'Memory blijft via on-delete-set-null in restaurant_chat_memory.';

-- ============================================================
-- 3. Cron-job inplannen (idempotent)
-- ============================================================
-- Eerst eventueel bestaande job met dezelfde naam unschedulen, anders
-- krijg je een duplicate-key-error bij re-runs van de migratie.
do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'cleanup_old_chat_conversations'
  ) then
    perform cron.unschedule('cleanup_old_chat_conversations');
  end if;
end;
$$;

-- Schedule: dagelijks om 03:17 UTC.
-- - Tijdstip: 's nachts NL-tijd (04:17 of 05:17, afhankelijk van DST),
--   minimale impact op live gebruikers
-- - 03:17 i.p.v. 03:00 om niet samen te vallen met andere cron-jobs
--   die vaak op het hele uur draaien (DB-load spreiden)
select cron.schedule(
  'cleanup_old_chat_conversations',
  '17 3 * * *',
  $$select public.cleanup_old_chat_conversations()$$
);
