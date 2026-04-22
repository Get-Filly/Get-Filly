-- ============================================================
-- Account-profiel uitbreidingen + Storage-bucket voor uploads
-- ============================================================

-- Nieuwe kolommen op restaurants (rijk profiel voor AI-context)
alter table public.restaurants
  add column if not exists tagline text,
  add column if not exists target_audience text,
  add column if not exists atmosphere text,
  add column if not exists unique_selling_points text,
  add column if not exists special_events text,
  add column if not exists menu_document_url text,
  add column if not exists website_summary text,
  add column if not exists website_last_analyzed_at timestamptz;

-- Seed: demo-waarden voor Bistro Get-Filly
update public.restaurants
set
  tagline = 'Gezellige buurtbistro in hart van Amsterdam',
  target_audience = 'Lokale bewoners, professionals op lunch, families op weekend, stelletjes op date-night',
  atmosphere = 'Warm, intiem, houten interieur, zacht jazzmuziek, open keuken zichtbaar vanuit de zaal',
  unique_selling_points = 'Eigen kruidentuin, wekelijks wisselend seizoensmenu, gastvrouw kent vaste gasten bij naam',
  special_events = 'Verjaardagen, bedrijfslunches (privéruimte tot 12 pers), trouwlunches'
where id = '00000000-0000-0000-0000-000000000001';

-- Storage-bucket voor menu-PDFs en andere restaurant-assets
insert into storage.buckets (id, name, public)
values ('restaurant-assets', 'restaurant-assets', true)
on conflict (id) do nothing;

-- Storage-policies: anon mag lezen + uploaden naar deze bucket
-- (later vervangen door auth-gebaseerde policies)
drop policy if exists "restaurant_assets_anon_read" on storage.objects;
create policy "restaurant_assets_anon_read" on storage.objects
  for select to anon
  using (bucket_id = 'restaurant-assets');

drop policy if exists "restaurant_assets_anon_insert" on storage.objects;
create policy "restaurant_assets_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'restaurant-assets');

drop policy if exists "restaurant_assets_anon_update" on storage.objects;
create policy "restaurant_assets_anon_update" on storage.objects
  for update to anon
  using (bucket_id = 'restaurant-assets');
