-- ============================================================
-- 0038_service_periods.sql
-- Per-dag service-tijden (ontbijt / lunch / diner) op restaurants
-- ============================================================
--
-- WAAROM een aparte JSONB-kolom naast `opening_hours`?
-- `opening_hours` zegt of de zaak überhaupt open is op een
-- weekdag (1 doorlopend tijdsblok). Service-periods splitst die
-- open-tijd op in commercieel-betekenisvolle delen: ontbijt /
-- lunch / diner. Plus per service een aantal zittingen, zodat
-- Filly en de dashboard-views weten hoe vaak tafels per service
-- gebruikt kunnen worden.
--
-- WAAROM JSONB en geen 3 aparte kolommen?
-- We hebben per service: actief-per-dag + tijden + zittings-aantal
-- = 7 dagen × 3 fields per dag × 3 services = 63 datapunten.
-- Drie aparte JSONB-velden ook prima, maar één combinatie maakt
-- het schema overzichtelijker en de UI/parsing simpeler.
--
-- WAAROM per dag en niet één globale config?
-- Floris-keuze 2026-05-12: weekend doet vaak ontbijt waar
-- doordeweeks alleen lunch+diner is. Tijden verschillen ook (zo
-- lunch tot 16:00, doordeweeks tot 15:00). Per-dag = realistisch
-- voor horeca.
--
-- SHAPE:
--   {
--     "breakfast": { "mon": null, "tue": null, ..., "sat": {start,end,session_count}, "sun": {...} },
--     "lunch":     { "mon": {...}, ..., "sun": {...} },
--     "dinner":    { "mon": {...}, ..., "sun": {...} }
--   }
--
-- - null op een dag-key = service niet actief die dag
-- - object = { start: "HH:MM", end: "HH:MM", session_count: 1-4 }
-- - dag-keys = engels 3-letter, zelfde als opening_hours (mon..sun)

alter table public.restaurants
  add column if not exists service_periods jsonb not null default
    jsonb_build_object(
      'breakfast', jsonb_build_object(
        'mon', null,
        'tue', null,
        'wed', null,
        'thu', null,
        'fri', null,
        'sat', jsonb_build_object('start', '09:00', 'end', '11:30', 'session_count', 1),
        'sun', jsonb_build_object('start', '09:00', 'end', '11:30', 'session_count', 1)
      ),
      'lunch', jsonb_build_object(
        'mon', jsonb_build_object('start', '12:00', 'end', '15:00', 'session_count', 2),
        'tue', jsonb_build_object('start', '12:00', 'end', '15:00', 'session_count', 2),
        'wed', jsonb_build_object('start', '12:00', 'end', '15:00', 'session_count', 2),
        'thu', jsonb_build_object('start', '12:00', 'end', '15:00', 'session_count', 2),
        'fri', jsonb_build_object('start', '12:00', 'end', '15:00', 'session_count', 2),
        'sat', jsonb_build_object('start', '12:00', 'end', '16:00', 'session_count', 2),
        'sun', jsonb_build_object('start', '12:00', 'end', '16:00', 'session_count', 2)
      ),
      'dinner', jsonb_build_object(
        'mon', jsonb_build_object('start', '17:30', 'end', '22:30', 'session_count', 2),
        'tue', jsonb_build_object('start', '17:30', 'end', '22:30', 'session_count', 2),
        'wed', jsonb_build_object('start', '17:30', 'end', '22:30', 'session_count', 2),
        'thu', jsonb_build_object('start', '17:30', 'end', '22:30', 'session_count', 2),
        'fri', jsonb_build_object('start', '17:30', 'end', '23:00', 'session_count', 2),
        'sat', jsonb_build_object('start', '17:30', 'end', '23:00', 'session_count', 2),
        'sun', jsonb_build_object('start', '17:30', 'end', '22:30', 'session_count', 2)
      )
    );

comment on column public.restaurants.service_periods is
  'Per-dag service-tijden voor ontbijt/lunch/diner. JSONB met 3 '
  'top-level keys (breakfast/lunch/dinner), elk met 7 dag-keys '
  '(mon..sun). Waarde per dag: null (niet actief) of '
  '{start:"HH:MM",end:"HH:MM",session_count:1-4}. session_count = '
  'aantal zittingen binnen de service-periode. Gebruikt door '
  'dashboard week- en dag-view en KPI-aggregaten.';
