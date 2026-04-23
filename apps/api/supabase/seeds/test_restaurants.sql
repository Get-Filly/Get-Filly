-- ============================================================
-- Get Filly — Test-data seed: tweede restaurant + team-koppelingen
-- ============================================================
-- Doel:
--   Voor multi-tenant tests heb je een TWEEDE restaurant nodig
--   bovenop het demo-restaurant Bistro Get-Filly uit migratie 0002.
--   Deze seed maakt "Cafe Get-Filly" aan en koppelt beide test-users
--   zodat de restaurant-switcher getest kan worden.
--
-- Idempotent: meermaals runnen is veilig dankzij on conflict do nothing.
--
-- Voorwaarden:
--   - Migraties 0001-0008 moeten zijn gedraaid.
--   - De twee test-users moeten bestaan in auth.users (via signup of
--     via invite). Dit script vult alleen de spiegel-rij in public.users.
--
-- Test-users:
--   - floriskoevermans@outlook.com → owner van beide restaurants
--   - developer@get-filly.com → manager van beide restaurants
-- ============================================================

-- 1) Tweede restaurant aanmaken
insert into public.restaurants (id, name, slug, type, country, brand_tone)
values (
  '00000000-0000-0000-0000-000000000002',
  'Cafe Get-Filly',
  'cafe-get-filly',
  'café',
  'NL',
  'casual'
)
on conflict (id) do nothing;

-- 2) Zeker stellen dat public.users-rijen bestaan voor de twee test-users.
--    (spiegel van auth.users — wordt normaal door de accept-flow gezet,
--     maar hier voor de zekerheid idempotent upserten)
insert into public.users (id)
select id from auth.users
where email in ('floriskoevermans@outlook.com', 'developer@get-filly.com')
on conflict (id) do nothing;

-- 3) Floris koppelen als OWNER van het nieuwe Cafe.
insert into public.restaurant_users (restaurant_id, user_id, role)
select
  '00000000-0000-0000-0000-000000000002',
  u.id,
  'owner'
from auth.users u
where u.email = 'floriskoevermans@outlook.com'
on conflict (restaurant_id, user_id) do nothing;

-- 4) Developer koppelen als MANAGER aan beide restaurants.
insert into public.restaurant_users (restaurant_id, user_id, role)
select
  r.id,
  u.id,
  'manager'
from auth.users u
cross join public.restaurants r
where u.email = 'developer@get-filly.com'
  and r.id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  )
on conflict (restaurant_id, user_id) do nothing;

-- ============================================================
-- Verificatie (handmatig runnen na de inserts)
-- ============================================================
-- select r.name, ru.role, u_auth.email
-- from public.restaurant_users ru
-- join public.restaurants r on r.id = ru.restaurant_id
-- join auth.users u_auth on u_auth.id = ru.user_id
-- where r.id in (
--   '00000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0000-000000000002'
-- )
-- order by r.name, ru.role;
