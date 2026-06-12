-- ============================================================
-- 0055: jaarlijkse-feestdagen-voorkeur per restaurant
-- ============================================================
-- Naast de evenementen-typen (mig 0054) kan de eigenaar op de
-- account-pagina ook de jaarlijkse NL-feestdagen (Valentijn, Pasen,
-- Koningsdag, Kerst, …) aan/uit zetten. Default aan. Bepaalt de
-- includeHolidays-vlag voor buildExternalFactorsBlock; loondagen,
-- seizoen en weer blijven altijd staan (puur context, geen trigger).

alter table public.restaurants
  add column if not exists event_holidays_enabled boolean not null default true;
