-- ============================================================
-- 0018 — Bedrijfsgegevens + e-mailinstellingen op restaurants
-- ============================================================
-- Voor mailings (afzender + reply-to), privacy-verklaring (KVK/BTW)
-- en algemene voorwaarden (juridische naam + contact). Allemaal
-- nullable zodat bestaande seed-data niet stuk gaat — eigenaar vult
-- ze in via /dashboard/account.
--
-- Wijzigingen:
--   - legal_name        : volledige juridische bedrijfsnaam
--   - kvk_number        : KvK-inschrijfnummer (8 cijfers, NL)
--   - vat_number        : BTW-nummer (NL + 9 cijfers + B + 2 cijfers)
--   - contact_email     : officieel klant-contactadres
--   - contact_phone     : officieel telefoonnummer
--   - email_from_name   : afzender-naam voor campagne-mails
--                         (bv. "Bistro Get-Filly")
--   - email_reply_to    : adres waar replies naartoe gaan (kan zelfde
--                         zijn als contact_email maar mag afwijken,
--                         bv. een no-reply met monitoring)

alter table public.restaurants
  add column if not exists legal_name text,
  add column if not exists kvk_number text,
  add column if not exists vat_number text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text;
