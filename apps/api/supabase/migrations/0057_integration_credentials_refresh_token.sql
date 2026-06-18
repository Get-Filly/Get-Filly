-- ============================================================
-- 0057_integration_credentials_refresh_token.sql
-- ============================================================
-- Voegt versleutelde refresh-token-opslag toe aan integration_credentials.
-- Nodig voor Google Bedrijfsprofiel (offline access): met de refresh-token
-- halen we langdurig nieuwe access-tokens zonder dat de eigenaar opnieuw
-- hoeft in te loggen. Net als access_token_encrypted is dit AES-256-GCM
-- ciphertext ("ivB64.tagB64.cipherB64"); de DB ziet nooit platte tokens.
-- Nullable: bestaande Meta-rijen hebben geen refresh-token.

alter table integration_credentials
  add column if not exists refresh_token_encrypted text;
