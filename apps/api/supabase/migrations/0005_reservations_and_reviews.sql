-- ============================================================
-- Fase 3: Reserveringen-tabel + seed · Reviews seed
-- ============================================================

-- Reserveringen-tabel
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  guest_name text,
  guest_phone text,
  guest_email text,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer default 2,
  status text check (status in ('bevestigd', 'geannuleerd', 'no_show', 'ingecheckt', 'voltooid')) default 'bevestigd',
  source text,
  notes text,
  special_requests text,
  table_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reservations_restaurant_date
  on public.reservations(restaurant_id, reservation_date);

alter table public.reservations enable row level security;

drop policy if exists "reservations_access" on public.reservations;
create policy "reservations_access" on public.reservations
  for all using (public.user_has_restaurant_access(restaurant_id));

-- Seed reserveringen (vandaag = 20 apr 2026, plus komende dagen)
insert into public.reservations (restaurant_id, guest_id, guest_name, guest_phone, reservation_date, reservation_time, party_size, status, source, special_requests, table_code) values
  ('00000000-0000-0000-0000-000000000001', (select id from public.guests where email = 'sophie.devries@example.nl'), 'Sophie de Vries', '+31612345678', '2026-04-20', '19:30', 4, 'bevestigd', 'zenchef', 'Verjaardag partner — graag tafel bij raam', 'T4'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.guests where email = 'marco.rossi@example.it'), 'Marco Rossi', '+31687654321', '2026-04-20', '20:00', 2, 'bevestigd', 'telefoon', 'Wijn-paring graag', 'T7'),
  ('00000000-0000-0000-0000-000000000001', null, 'Julia Bakker', '+31611223344', '2026-04-20', '18:30', 6, 'bevestigd', 'zenchef', null, 'T10'),
  ('00000000-0000-0000-0000-000000000001', null, 'Peter van Dijk', '+31622334455', '2026-04-20', '21:00', 2, 'bevestigd', 'opentable', null, 'T2'),
  ('00000000-0000-0000-0000-000000000001', null, 'Karin de Jong', '+31633445566', '2026-04-21', '19:00', 2, 'bevestigd', 'zenchef', null, 'T3'),
  ('00000000-0000-0000-0000-000000000001', null, 'Thomas Visser', '+31644556677', '2026-04-21', '20:30', 4, 'bevestigd', 'telefoon', 'Glutenvrij voor 1 pers', 'T8'),
  ('00000000-0000-0000-0000-000000000001', null, 'Anna Meijer', '+31655667788', '2026-04-22', '19:00', 3, 'bevestigd', 'zenchef', null, 'T5'),
  ('00000000-0000-0000-0000-000000000001', null, 'Henk Kramer', '+31666778899', '2026-04-23', '20:00', 2, 'bevestigd', 'opentable', null, 'T1'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.guests where email = 'lisa.vdberg@example.nl'), 'Lisa van den Berg', '+31698765432', '2026-04-24', '19:30', 2, 'bevestigd', 'manual', 'Eerste keer, vraag naar welkomsbord', 'T6'),
  ('00000000-0000-0000-0000-000000000001', null, 'Robert Jansen', '+31677889900', '2026-04-25', '20:00', 8, 'bevestigd', 'telefoon', 'Bedrijfsdiner — privéruimte geboekt', 'Privé'),
  ('00000000-0000-0000-0000-000000000001', null, 'Sanne de Wit', '+31688990011', '2026-04-18', '19:00', 2, 'no_show', 'zenchef', null, 'T3'),
  ('00000000-0000-0000-0000-000000000001', null, 'Dirk Willems', '+31699001122', '2026-04-19', '20:30', 4, 'voltooid', 'zenchef', null, 'T7');

-- Reviews seed
insert into public.reviews (restaurant_id, source, rating, title, body, author, review_date) values
  ('00000000-0000-0000-0000-000000000001', 'google', 5, 'Heerlijk gegeten', 'Kalfsstoof was perfect, wijnadvies top. Zeker terugkomen.', 'Jan Smit', '2026-04-17'),
  ('00000000-0000-0000-0000-000000000001', 'google', 4, 'Leuk buurtrestaurantje', 'Gezellig, goed eten. Service iets langzaam op drukke vrijdag.', 'Eva de Groot', '2026-04-14'),
  ('00000000-0000-0000-0000-000000000001', 'tripadvisor', 5, 'Hidden gem in Amsterdam', 'Fantastische seizoensmenu, vriendelijk personeel. Zeebaars was voortreffelijk.', 'Michael B.', '2026-04-12'),
  ('00000000-0000-0000-0000-000000000001', 'google', 3, 'Gemengde ervaring', 'Eten was goed, maar we moesten lang wachten op onze tafel. Reservering stond wel op naam.', 'Rob Tinnemans', '2026-04-08'),
  ('00000000-0000-0000-0000-000000000001', 'thefork', 5, 'Topavond!', 'Prachtig terras, heerlijke wijnkaart. Aanrader voor date-night.', 'Linda M.', '2026-04-06'),
  ('00000000-0000-0000-0000-000000000001', 'google', 5, 'Huiselijke sfeer', 'Voelt echt als thuis — chef komt langs voor praatje. Crème brûlée was onvergetelijk.', 'Pieter van der Berg', '2026-03-28'),
  ('00000000-0000-0000-0000-000000000001', 'tripadvisor', 2, 'Teleurstellend', 'Reservering niet doorgegaan ondanks bevestiging. Excuses ontvangen maar jammer.', 'A. Hendriks', '2026-03-22'),
  ('00000000-0000-0000-0000-000000000001', 'google', 4, 'Lekker lunchen', 'Chef''s Lunch aanbieding is prima waar voor je geld. Asperges uit eigen tuin voel je echt.', 'Marieke V.', '2026-04-17');
