-- ============================================================
-- 0058_campaign_social_publish_state.sql
-- ============================================================
-- Publicatiestaat voor social-campagnes. Tot nu toe deed "Activeer nu"
-- voor social alleen een status-flip ("stille no-send"); nu publiceren
-- we echt naar Facebook/Instagram via de (goedgekeurde) Meta-koppeling.
-- Deze kolommen houden bij of/wanneer er gepubliceerd is, met welke
-- post-id('s) (nodig om dubbel posten te voorkomen, en later om een
-- post terug te trekken), en de laatste fout als publiceren mislukte.

alter table campaign_social_content
  -- Wanneer de campagne naar FB/IG is geplaatst. Null = nog niet.
  -- Dubbel-post-guard: gevuld → publiceren is een no-op.
  add column if not exists published_at timestamptz,
  -- Per netwerk de geplaatste post-id, bv. {"facebook":"123_456","instagram":"178..."}.
  add column if not exists published_post_ids jsonb,
  -- Laatste publicatiefout (Meta-melding) als het (deels) misging.
  add column if not exists publish_error text;
