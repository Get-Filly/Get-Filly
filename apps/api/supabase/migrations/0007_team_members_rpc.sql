-- ============================================================
-- Get Filly — Migratie 0007
-- RPC-functie voor het ophalen van teamleden inclusief e-mail
-- ============================================================
-- Waarom deze functie?
--   Om een lijst "teamleden" te tonen hebben we 3 tabellen nodig:
--     - restaurant_users  (koppelt user aan restaurant, met rol)
--     - public.users      (heeft full_name)
--     - auth.users        (heeft email — beheerd door Supabase Auth)
--
--   Vanuit de Supabase JS-SDK is het lastig om auth.users te joinen
--   (apart schema, vereist hogere rechten). Een RPC-functie omzeilt
--   dit: we definiëren de query in de DB en roepen hem aan met
--   .rpc('get_restaurant_members', { rid: <uuid> }).
--
--   security definer zorgt dat de functie draait met de rechten
--   van de eigenaar van de functie (postgres-role) zodat hij auth.users
--   mag lezen. De backend bepaalt zelf wie de functie mag aanroepen.
-- ============================================================

create or replace function public.get_restaurant_members(rid uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  permissions jsonb,
  created_at timestamptz
)
language sql
security definer
stable
as $$
  select
    ru.user_id,
    au.email::text,
    u.full_name,
    ru.role,
    ru.permissions,
    ru.created_at
  from public.restaurant_users ru
  left join public.users u on u.id = ru.user_id
  left join auth.users au on au.id = ru.user_id
  where ru.restaurant_id = rid
  order by ru.created_at;
$$;

comment on function public.get_restaurant_members(uuid) is
  'Geeft alle users die aan dit restaurant gekoppeld zijn, inclusief email (uit auth.users) en full_name (uit public.users).';
