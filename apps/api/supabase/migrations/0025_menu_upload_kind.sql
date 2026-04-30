-- ============================================================
-- Get Filly — Migratie 0025
-- menu_uploads.kind voor onderscheid menu-kaart vs drankkaart
-- ============================================================
-- Context:
--   Sinds 0024 kunnen eigenaren naast een menukaart ook een
--   drankkaart uploaden. Beide belanden in menu_uploads, maar
--   we kunnen ze nu nog niet onderscheiden — de banner op
--   /dashboard/menu toont daardoor altijd "Menu-kaart actief"
--   ook voor drankkaart-uploads.
--
-- Aanpak:
--   Eenvoudige text-kolom met CHECK-constraint. 'menu' default
--   zodat bestaande rijen automatisch correct gelabeld zijn
--   (alle huidige uploads zijn menukaart-uploads, drinks-flow
--   is brand-new).
--
-- UI-effect:
--   Frontend kan voortaan twee aparte banners tonen — één voor
--   de actieve menukaart, één voor de actieve drankkaart.
-- ============================================================

alter table public.menu_uploads
  add column if not exists kind text default 'menu'
  check (kind in ('menu', 'drinks'));

comment on column public.menu_uploads.kind is
  'Wat voor kaart deze upload bevatte: ''menu'' (regulier menukaart) of ''drinks'' (drankkaart). Bepaalt welke banner de UI toont en welk Vision-prompt destijds is gebruikt.';

-- Index op (restaurant_id, kind, created_at) voor de "geef de
-- meest recente actieve menukaart per kind"-query op de menu-pagina.
create index if not exists idx_menu_uploads_restaurant_kind_recent
  on public.menu_uploads(restaurant_id, kind, created_at desc)
  where processed_at is not null and processing_error is null;
