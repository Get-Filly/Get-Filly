-- ============================================================
-- Get Filly — Migratie 0049
-- campaign_sends.send_mode (test vs live broadcast)
-- ============================================================
-- Achtergrond:
--   We slaan elke verstuurde mail (test óf live) op in campaign_sends.
--   Voor het 'Verstuurd' / 'Klaar voor verzending'-statuslabel én voor
--   de campaign_performance-tracking willen we test-mails kunnen
--   onderscheiden van échte broadcasts naar de opt-in-lijst.
--
-- Strategie:
--   Nieuwe kolom send_mode met enum ('test' | 'all_opted_in'). Default
--   'all_opted_in' zodat bestaande rijen (vóór deze migratie) blijven
--   gelden als 'echte' sends; er waren geen test-rijen tot deze fix.
--
--   Index op (campaign_id, send_mode) zodat de count-by-mode-query
--   snel blijft bij grote send-volumes.
-- ============================================================

alter table public.campaign_sends
  add column if not exists send_mode text
    check (send_mode in ('test', 'all_opted_in'))
    default 'all_opted_in';

create index if not exists idx_campaign_sends_mode
  on public.campaign_sends(campaign_id, send_mode);

comment on column public.campaign_sends.send_mode is
  'Onderscheid tussen test-mails (geen impact op status/performance) en live broadcast.';
