-- ============================================================
-- Get Filly — Migratie 0015
-- Storage-bucket voor campagne-media (foto's bij social/whatsapp)
-- ============================================================
-- Doel:
--   Eigenaar kan een foto uploaden bij een concept-campagne (social
--   of whatsapp). De foto wordt getoond in de preview én later
--   doorgestuurd naar Instagram/Meta/WhatsApp Business API bij
--   verzending. Geen historie: max 1 foto per campagne, vervangen
--   bij her-upload.
--
-- Architectuur:
--   Storage-bucket: campaign-media (private)
--   Pad: <restaurant_id>/<campaign_id>/<timestamp>-<filename>
--   - Restaurant_id eerste segment voor RLS-check
--   - Campaign_id tweede segment om bij delete-campagne alle bestanden
--     in één rmdir te kunnen wissen
--
-- Geen aparte metadata-tabel (anders dan menu_uploads): de URL leeft
-- al in campaign_social_content.media_urls[] of campaign_whatsapp_content.media_url.
-- Audit-info zit in campaigns.updated_at + storage.objects.created_at.
-- ============================================================

-- Bucket aanmaken (idempotent). Private: geen public URL — backend
-- genereert signed URLs voor de preview en straks voor verzend-
-- platforms.
insert into storage.buckets (id, name, public)
values ('campaign-media', 'campaign-media', false)
on conflict (id) do nothing;

-- RLS-policies. Patroon identiek aan menu-uploads (migratie 0011):
-- eerste path-component is de restaurant_id, en we hergebruiken
-- de bestaande user_has_restaurant_access-functie zodat alleen
-- team-leden van dat restaurant erbij kunnen.

drop policy if exists "campaign_media_read" on storage.objects;
create policy "campaign_media_read" on storage.objects
  for select using (
    bucket_id = 'campaign-media'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "campaign_media_write" on storage.objects;
create policy "campaign_media_write" on storage.objects
  for insert with check (
    bucket_id = 'campaign-media'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "campaign_media_update" on storage.objects;
create policy "campaign_media_update" on storage.objects
  for update using (
    bucket_id = 'campaign-media'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "campaign_media_delete" on storage.objects;
create policy "campaign_media_delete" on storage.objects
  for delete using (
    bucket_id = 'campaign-media'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

comment on column public.campaign_social_content.media_urls is
  'Storage-paden (bucket: campaign-media) van geüploade foto''s. Voor v1 max 1 foto per campagne. Backend genereert signed URLs voor preview + verzend-API''s; we slaan geen public URLs op zodat key-rotation/bucket-rename niet door tabellen heen breekt.';

comment on column public.campaign_whatsapp_content.media_url is
  'Storage-pad (bucket: campaign-media) van geüploade foto. Backend genereert signed URL voor preview + WhatsApp Business API.';
