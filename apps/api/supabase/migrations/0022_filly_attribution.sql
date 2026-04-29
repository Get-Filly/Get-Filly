-- ============================================================
-- 0022 — Filly-attributie: koppel reserveringen + gasten aan campagnes
-- ============================================================
-- Tot nu toe konden we niet meten welke reserveringen of gasten
-- daadwerkelijk via een Filly-campagne binnenkwamen — alle "via Filly"-
-- cijfers waren mock-data of een hash-grap. Met deze twee FKs maken
-- we attributie eindelijk hard.
--
-- Wijzigingen:
--   - reservations.via_campaign_id    → campaigns(id) on delete set null
--   - guests.acquired_via_campaign_id → campaigns(id) on delete set null
--
-- `on delete set null` (geen cascade): als een campagne wordt
-- verwijderd verliezen we de attributie maar niet de reservering of
-- gast. Dat hoort: de business-data is leidend.
--
-- Index op via_campaign_id zodat KPI-aggregaties (filter op
-- restaurant_id + via_campaign_id is not null) snel blijven, ook bij
-- duizenden reserveringen per restaurant.

alter table public.reservations
  add column if not exists via_campaign_id uuid
    references public.campaigns(id) on delete set null;

create index if not exists idx_reservations_via_campaign
  on public.reservations(restaurant_id, via_campaign_id)
  where via_campaign_id is not null;

alter table public.guests
  add column if not exists acquired_via_campaign_id uuid
    references public.campaigns(id) on delete set null;

create index if not exists idx_guests_acquired_via_campaign
  on public.guests(restaurant_id, acquired_via_campaign_id)
  where acquired_via_campaign_id is not null;
