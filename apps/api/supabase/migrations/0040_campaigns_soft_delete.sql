-- ============================================================
-- 0040_campaigns_soft_delete.sql
-- ============================================================
-- Maakt verwijderde campagnes terugvindbaar in /campagnes/history
-- onder de tab "Verwijderd". Voorheen deed `× Verwijderen` een
-- hard DELETE waardoor de rij definitief weg was — Floris wil ze
-- nu zien staan onder een aparte tab.
--
-- NULL = actieve campagne. Niet-NULL = soft-deleted, alleen via
-- de Verwijderd-tab zichtbaar. Backend findAll() filtert standaard
-- `.is('deleted_at', null)`; nieuwe endpoint /campaigns/deleted
-- toont juist `.not('deleted_at', 'is', null)`.

ALTER TABLE campaigns
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial index zodat de niet-verwijderde records (~99%) geen
-- indexkosten geven; alleen verwijderde records komen erin.
CREATE INDEX idx_campaigns_deleted_at
  ON campaigns(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN campaigns.deleted_at IS
  'Soft-delete timestamp. NULL = actief. Niet-NULL = verwijderd door eigenaar via /campagnes Concept-card, terug te vinden in /campagnes/history onder tab Verwijderd.';
