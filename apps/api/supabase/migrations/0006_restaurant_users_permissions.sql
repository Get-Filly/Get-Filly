-- ============================================================
-- Get Filly — Migratie 0006
-- Permissions per user binnen een restaurant (fine-grained access)
-- ============================================================
-- Context:
--   Tot nu toe had restaurant_users alleen een 'role' kolom (owner/
--   manager/staff). Voor echte team-functionaliteit wil de eigenaar
--   per gebruiker kunnen bepalen welke modules (pagina's/features)
--   die mag zien.
--
-- Hoe dit werkt:
--   - permissions is NULL → gebruik de default-permissies voor de rol
--     (defaults staan in TypeScript-code, niet hardcoded in DB — dat
--     is flexibeler en makkelijker te wijzigen).
--   - permissions is gevuld → override de defaults met deze waardes.
--
-- Structuur van de jsonb:
--   { "modules": ["reserveringen", "gasten", "campagnes", ...] }
--
--   Simpele array van module-keys die de gebruiker mag zien.
--   Later kunnen we dit uitbreiden met read/write/delete per module.
-- ============================================================

-- Stap 1: voeg de kolom toe. "if not exists" maakt het script
--         idempotent: je kunt hem veilig meerdere keren runnen.
alter table public.restaurant_users
  add column if not exists permissions jsonb;

-- Stap 2: documentatie op de kolom, zichtbaar in Supabase Studio.
comment on column public.restaurant_users.permissions is
  'Custom permissies voor deze user binnen dit restaurant. NULL = rol-defaults. Structuur: {"modules": ["reserveringen","gasten",...]}';

-- Stap 3: helper-functie die de role voor de ingelogde user ophaalt.
--         We gaan deze gebruiken in RLS-policies straks — maar ook
--         gewoon om rol-gebaseerde checks makkelijker te maken.
create or replace function public.user_role_in_restaurant(rid uuid)
returns text
language sql
security definer
stable
as $$
  select role
  from public.restaurant_users
  where restaurant_id = rid and user_id = auth.uid()
  limit 1;
$$;

comment on function public.user_role_in_restaurant(uuid) is
  'Geeft de rol (owner/manager/staff) van de ingelogde user voor het gegeven restaurant. NULL als geen toegang.';
