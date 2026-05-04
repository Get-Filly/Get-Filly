-- ============================================================
-- 0031 — Restaurant media library (Filly's foto-bibliotheek)
-- ============================================================
-- Tabel voor restaurant-foto's die hergebruikt kunnen worden in
-- meerdere campagnes, plus Filly-suggestie-flow.
--
-- Lifecycle: eigenaar uploadt foto via account-pagina → file naar
-- Storage bucket 'restaurant-assets' onder path
-- '<restaurant_id>/photos/<uuid>.<ext>' → DB-rij met description +
-- tags die door MediaTaggerService (Haiku 4.5 Vision, eenmalig)
-- worden gegenereerd. Filly krijgt die tekst bij elke campagne-call
-- mee en kan suggereren welke foto past.
--
-- Cap: 20 foto's per restaurant — afgedwongen in service, niet via
-- DB-constraint zodat een soft-fail mogelijk blijft (bv. Filly-flow
-- die intern foto's genereert).
-- ============================================================

create table if not exists public.restaurant_media (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Storage-pad zonder bucket-naam, bv. '<restaurant_id>/photos/<uuid>.jpg'.
  -- Gebruikt om signed-URL's te genereren voor weergave en om bestanden
  -- weer te kunnen verwijderen bij delete.
  file_path text not null unique,
  file_name text not null,            -- originele naam, voor download/UX
  mime_type text not null,            -- image/jpeg, image/png, image/webp
  size_bytes integer not null,        -- voor cap-totaal-storage indien later nodig

  -- Vision-tag-resultaten. Beide nullable zodat upload niet faalt als
  -- de Vision-call laat klaar is — service kan async een rij vullen.
  description text,                   -- 1 zin Nederlands, max ~150 tekens
  tags text[] default '{}',           -- 3-5 keywords (gerecht/vegetarisch/team/etc)

  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz default now()
);

create index if not exists idx_restaurant_media_restaurant
  on public.restaurant_media(restaurant_id, uploaded_at desc);

-- RLS — zelfde pattern als andere restaurant-scoped tabellen.
alter table public.restaurant_media enable row level security;
drop policy if exists "restaurant_media_access" on public.restaurant_media;
create policy "restaurant_media_access" on public.restaurant_media
  for all using (public.user_has_restaurant_access(restaurant_id));

comment on table public.restaurant_media is
  'Foto-bibliotheek per restaurant. Bestanden in Storage bucket restaurant-assets. Door Filly gebruikt voor campagne-suggesties via description + tags (gegenereerd bij upload via Haiku Vision).';
