-- ============================================================
-- Migratie 0028 — chat memory + 20-berichten cap + seed-cleanup
-- ============================================================
--
-- Voegt drie dingen toe:
--   1. `restaurant_chat_memory` — Filly's gedestilleerde leerschat per
--      restaurant. Wordt automatisch gevuld zodra een chat de cap van
--      20 berichten raakt: Claude Haiku vat samen wat geleerd / afgewezen /
--      geprefereerd is. Volgende chats lezen deze samenvattingen in de
--      system-prompt zodat Filly z'n geheugen behoudt zonder dat we
--      lange chat-histories moeten meeslepen (token-besparing).
--
--   2. Index op `chat_messages.conversation_id` als die nog niet bestaat
--      — voor de cap-count-query (telt berichten per conversatie).
--      Idempotent want `if not exists`.
--
--   3. Cleanup van mock-conversaties uit migratie 0001 (donderdag/38%-
--      demo). Die staan al maanden in de seed-database en zijn voor
--      nieuwe klanten verwarrend. Identificeren we via
--      `created_at < '2026-01-01'` (alle echte conversaties zijn van
--      na de productie-launch).
--
-- ============================================================

-- ----------------------------------------------------------
-- 1. restaurant_chat_memory tabel
-- ----------------------------------------------------------
create table if not exists public.restaurant_chat_memory (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- De conversatie die tot deze memory leidde. NULL als de bron-
  -- conversatie later gewist wordt — de memory zelf blijft dan staan
  -- want die is al verwerkt in Filly's leerschat.
  source_conversation_id uuid references public.chat_conversations(id) on delete set null,
  -- Vrije tekst van Filly: "wat heeft de eigenaar geleerd / afgewezen /
  -- geprefereerd in deze chat". Wordt direct in de system-prompt van
  -- volgende chats gegoten.
  summary text not null,
  -- Optionele gestructureerde extractie. Voor MVP nog leeg — komt later
  -- als we expliciete velden op de account-pagina toevoegen
  -- ({forbidden_words, style_notes, rejection_themes}).
  preferences_extracted jsonb,
  created_at timestamptz not null default now()
);

-- Index voor de meest-frequente query: "geef mij de laatste N memories
-- voor restaurant X". Ordered desc voor snelle latest-first retrieval.
create index if not exists idx_chat_memory_restaurant_recent
  on public.restaurant_chat_memory (restaurant_id, created_at desc);

-- RLS: alleen team-members van het restaurant mogen de memories lezen.
-- Zelfde patroon als chat_messages — backend draait nu nog op
-- service_role (RLS-bypass) maar de policies staan klaar voor wanneer
-- we naar per-request user-JWT migreren (Fase B).
alter table public.restaurant_chat_memory enable row level security;

-- Drop+create voor idempotency: bij re-run faalt CREATE POLICY anders
-- met 42710 "policy already exists" (Postgres ondersteunt geen
-- IF NOT EXISTS op CREATE POLICY).
drop policy if exists "Team members can read chat memory"
  on public.restaurant_chat_memory;
create policy "Team members can read chat memory"
  on public.restaurant_chat_memory
  for select
  using (
    restaurant_id in (
      select restaurant_id
      from public.restaurant_users
      where user_id = auth.uid()
    )
  );

drop policy if exists "Team members can insert chat memory"
  on public.restaurant_chat_memory;
create policy "Team members can insert chat memory"
  on public.restaurant_chat_memory
  for insert
  with check (
    restaurant_id in (
      select restaurant_id
      from public.restaurant_users
      where user_id = auth.uid()
    )
  );

comment on table public.restaurant_chat_memory is
  'Filly''s leerschat per restaurant. Auto-gevuld bij chat-cap (20 berichten). Wordt in system-prompt van volgende chats gegoten zodat Filly geleerde voorkeuren behoudt zonder lange chat-histories mee te slepen.';

-- ----------------------------------------------------------
-- 2. Index op chat_messages voor cap-count-query
-- ----------------------------------------------------------
-- count(*) where conversation_id = X wordt per user-bericht aangeroepen
-- om te checken of de cap bereikt is. Index voorkomt seq-scan bij grote
-- conversation-volumes.
create index if not exists idx_chat_messages_conversation_id
  on public.chat_messages (conversation_id);

-- ----------------------------------------------------------
-- 3. Seed-cleanup: oude mock-conversaties wissen
-- ----------------------------------------------------------
-- Mock-data van vóór 2026-01-01 is uit migratie 0001 (donderdag/38%-
-- demo conversatie). Die staan in alle seed-restaurants en zijn nu
-- verwarrend voor nieuwe klanten die hun chat openen en historie
-- vinden die ze nooit getypt hebben.
--
-- on delete cascade op chat_messages.conversation_id (mig 0001) zorgt
-- dat de berichten automatisch mee verdwijnen. Idempotent: tweede run
-- vindt geen rijen meer en doet niets.
delete from public.chat_conversations
where created_at < '2026-01-01';
