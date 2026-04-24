-- ============================================================
-- Get Filly — Migratie 0011
-- menu_uploads-tabel + Storage-bucket voor Vision-analyse
-- ============================================================
-- Doel:
--   Eigenaar kan tijdens onboarding (en later via menu-pagina) een
--   foto of PDF van zijn menukaart uploaden. Claude Vision (Opus 4.7)
--   leest de kaart en genereert menu_items-rijen. Voor audit/archief
--   bewaren we het bron-bestand in Storage én een metadata-rij in
--   menu_uploads.
--
-- Architectuur:
--   Supabase Storage-bucket:
--     menu-uploads/ (private, per-restaurant path-prefix)
--   Tabel:
--     menu_uploads: 1 rij per upload-event, linkt naar Storage-path
--   FK op menu_items:
--     menu_upload_id → menu_uploads.id (nullable, want handmatig
--     toegevoegde items hebben geen upload-bron)
-- ============================================================

-- Tabel
create table if not exists public.menu_uploads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Pad binnen de menu-uploads bucket, relatief aan bucket-root.
  -- Conventie: <restaurant_id>/<uuid>-<originele-filename>.<ext>
  file_path text not null,
  file_name text, -- originele filename van de user (voor weergave)
  file_size_bytes integer,
  mime_type text, -- 'application/pdf', 'image/jpeg', 'image/png'
  -- Vision-verwerking: null tot Claude klaar is.
  processed_at timestamptz,
  extracted_items_count integer,
  processing_error text, -- NL-tekst bij falen; user kan opnieuw proberen
  -- Wie heeft geüpload (audit-trail). Mag null zijn voor scheduled jobs.
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists menu_uploads_restaurant_idx
  on public.menu_uploads(restaurant_id, created_at desc);

-- FK op menu_items zodat we weten welke items uit welke upload komen.
-- Nullable: handmatig toegevoegde gerechten hebben geen upload-link.
alter table public.menu_items
  add column if not exists menu_upload_id uuid
    references public.menu_uploads(id) on delete set null;

alter table public.menu_uploads enable row level security;

-- Storage-bucket aanmaken (idempotent). Private: geen public URL.
-- Backend service_role mag alles, users zien hun eigen restaurant.
insert into storage.buckets (id, name, public)
values ('menu-uploads', 'menu-uploads', false)
on conflict (id) do nothing;

-- Storage-policies: users mogen bestanden in hun eigen-restaurant-pad
-- lezen + schrijven. We gebruiken de eerste path-component als
-- restaurant_id (conventie: <restaurant_id>/<filename>).
-- SELECT: elk team-lid met access tot het restaurant mag de upload zien.
-- INSERT/UPDATE/DELETE: idem — alle rollen mogen menu's beheren.
-- (Fijnmaziger per rol kan later via @RequireModule.)
drop policy if exists "menu_uploads_read" on storage.objects;
create policy "menu_uploads_read" on storage.objects
  for select using (
    bucket_id = 'menu-uploads'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "menu_uploads_write" on storage.objects;
create policy "menu_uploads_write" on storage.objects
  for insert with check (
    bucket_id = 'menu-uploads'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "menu_uploads_update" on storage.objects;
create policy "menu_uploads_update" on storage.objects
  for update using (
    bucket_id = 'menu-uploads'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "menu_uploads_delete" on storage.objects;
create policy "menu_uploads_delete" on storage.objects
  for delete using (
    bucket_id = 'menu-uploads'
    and public.user_has_restaurant_access((storage.foldername(name))[1]::uuid)
  );

comment on table public.menu_uploads is
  'Archief + metadata van geüploade menukaart-bestanden (PDF/foto). Vision-verwerking naar menu_items gebeurt in de backend; processed_at is null tot klaar.';
