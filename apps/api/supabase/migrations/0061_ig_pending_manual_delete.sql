-- ============================================================
-- 0061_ig_pending_manual_delete.sql
-- ============================================================
-- Instagram laat geen verwijderen van geplaatste media toe via de Graph
-- API (alleen Facebook kan dat). Stopt/verwijdert een eigenaar een
-- campagne die naar Instagram is geplaatst, dan moet de IG-post HANDMATIG
-- in de Instagram-app weg. Deze kolom bewaart de directe link naar die
-- post zodat de UI een nette "verwijder zelf in Instagram"-melding kan
-- tonen (met "Open in Instagram"-knop). Null = niets handmatig te doen.
-- Wordt gezet bij terugtrekken en weer gewist bij een nieuwe publicatie.

alter table campaign_social_content
  add column if not exists ig_pending_manual_delete_url text;
