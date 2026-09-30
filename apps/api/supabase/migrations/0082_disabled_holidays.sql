-- 0082_disabled_holidays.sql
-- Feestdagen per stuk aan of uit zetten. Filly speelt standaard op alle
-- feestdagen in (Valentijn, Pasen, Koningsdag, Kerst enzovoort); de eigenaar
-- kan er in de instellingen een of meer uitzetten. Naast de bestaande
-- hoofdschakelaar voor alle feestdagen (event_holidays_enabled, mig 0055).
--
-- Opslag: een lijst van sleutels van UITGEZETTE feestdagen, zoals
-- '1e-paasdag' of 'nieuwjaarsdag'. Leeg = alles aan (dus het gedrag
-- verandert voor niemand die niets instelt).
alter table public.businesses
  add column if not exists disabled_holidays text[] not null default '{}';

comment on column public.businesses.disabled_holidays is
  'Feestdagen die de eigenaar heeft uitgezet, als sleutels (bv. 1e-paasdag). Filly speelt daar niet op in. Leeg = alle feestdagen aan.';
