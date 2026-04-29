-- ============================================================
-- 0021 — restaurant-assets storage-policies aanscherpen
-- ============================================================
-- De `restaurant-assets`-bucket had sinds 0003 publieke
-- read/insert/update-policies voor `anon`. Dat betekent dat
-- iedereen ter wereld zonder login kan uploaden naar deze bucket
-- (logo's, menu-PDFs).
--
-- Wijzigingen:
--   - Anon mag NIET meer schrijven (insert/update). Alleen
--     ingelogde users (`authenticated`-rol) krijgen daar rechten.
--   - Anon-read blijft, want logo's worden in mail-templates en
--     publieke campagne-previews vertoond — die laden zonder JWT.
--     De bucket is `public`, dus de daadwerkelijke binary is
--     toch via signed/public URL bereikbaar; we verbieden alleen
--     de directe storage-API-toegang voor schrijven.
--
-- Toekomst: per-restaurant path-prefix + RLS-check op
-- `restaurant_users`-koppel zou nog strenger zijn ("alleen owner
-- van bucket-folder mag schrijven"). Voor nu is `authenticated`-only
-- al een grote stap vooruit t.o.v. anon-write.

-- 1) Oude anon-write-policies droppen
drop policy if exists "restaurant_assets_anon_insert" on storage.objects;
drop policy if exists "restaurant_assets_anon_update" on storage.objects;

-- Anon DELETE bestond niet expliciet, maar weren voor de zekerheid.
drop policy if exists "restaurant_assets_anon_delete" on storage.objects;

-- 2) Nieuwe authenticated-only policies voor write
create policy "restaurant_assets_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-assets');

create policy "restaurant_assets_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-assets');

create policy "restaurant_assets_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-assets');

-- 3) Anon-read laten staan (nodig voor publieke logo-vertoning in
--    mail-templates / og-images). Geen wijziging — bestaande policy
--    blijft actief.
