-- 0059_restaurant_filly_language.sql
-- ============================================================
-- Filly-taal per restaurant: in welke taal Filly's chat antwoordt.
-- Account-instelling (account → Algemeen → "Filly antwoordt in het Engels").
-- De chat-prompt (buildSystemPrompt) leest deze kolom en schakelt de
-- antwoordtaal om; default blijft Nederlands.
-- ============================================================

alter table restaurants
  add column if not exists filly_language text not null default 'nl';

-- Alleen 'nl' of 'en' toestaan (idempotent: alleen toevoegen als 'ie nog niet bestaat).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_filly_language_check'
  ) then
    alter table restaurants
      add constraint restaurants_filly_language_check
      check (filly_language in ('nl', 'en'));
  end if;
end $$;
