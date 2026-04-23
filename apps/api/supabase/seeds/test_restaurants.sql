-- ============================================================
-- Get Filly — Test-data seed: tweede restaurant + team-koppelingen
-- ============================================================
-- Doel:
--   Voor multi-tenant tests heb je een TWEEDE restaurant nodig
--   bovenop het demo-restaurant Bistro Get-Filly uit migratie 0002.
--   Deze seed maakt "Cafe Get-Filly" aan en koppelt Floris (owner)
--   + developer@get-filly.com (manager) aan dit tweede restaurant.
--
-- Idempotent: meermaals runnen is veilig dankzij on conflict do nothing.
--
-- Voorwaarden:
--   - Migraties 0001-0009 moeten zijn gedraaid.
--   - De twee test-users moeten bestaan in auth.users (via signup of
--     via invite). Dit script vult alleen de spiegel-rij in public.users.
--
-- Test-users:
--   - floriskoevermans@outlook.com → owner van het Cafe
--   - developer@get-filly.com → manager van het Cafe
--   (De koppeling aan Bistro Get-Filly gaat normaal via de team-invite-
--    flow, niet via deze seed.)
-- ============================================================

-- 1) Tweede restaurant aanmaken (idempotent via on conflict)
insert into public.restaurants (id, name, slug, type, city, country)
values (
  '00000000-0000-0000-0000-000000000002',
  'Cafe Get-Filly',
  'cafe-get-filly',
  'café',
  'Amsterdam',
  'NL'
)
on conflict (id) do nothing;

-- 2) Zeker stellen dat public.users-rijen bestaan voor de twee test-users
--    (spiegel van auth.users — wordt normaal door accept-flow gezet,
--     maar hier voor de zekerheid idempotent upserten)
insert into public.users (id)
select id from auth.users
where email in ('floriskoevermans@outlook.com', 'developer@get-filly.com')
on conflict (id) do nothing;

-- 3) Floris koppelen als OWNER van het nieuwe Cafe
insert into public.restaurant_users (restaurant_id, user_id, role)
select
  '00000000-0000-0000-0000-000000000002',
  u.id,
  'owner'
from auth.users u
where u.email = 'floriskoevermans@outlook.com'
on conflict (restaurant_id, user_id) do nothing;

-- 4) developer@get-filly.com koppelen als MANAGER van het nieuwe Cafe
insert into public.restaurant_users (restaurant_id, user_id, role)
select
  '00000000-0000-0000-0000-000000000002',
  u.id,
  'manager'
from auth.users u
where u.email = 'developer@get-filly.com'
on conflict (restaurant_id, user_id) do nothing;

-- 5) Verificatie — moet 4 rijen laten zien (2 restaurants × 2 users)
select
  r.name         as restaurant,
  au.email       as user_email,
  ru.role        as rol,
  ru.created_at  as gekoppeld_op
from public.restaurant_users ru
join public.restaurants r on r.id = ru.restaurant_id
join auth.users au on au.id = ru.user_id
where au.email in ('floriskoevermans@outlook.com', 'developer@get-filly.com')
order by r.name, au.email;
