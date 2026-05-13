-- ============================================================
-- Get Filly — Migratie 0042
-- Backfill campaigns.ai_suggestion_id voor bestaande concepts
-- ============================================================
-- Probleem:
--   Tot 2026-05-13 zette approveSuggestion + approveMultiChannel
--   wel ai_suggestions.approved_campaign_id (FK richting campagne)
--   maar NIET campaigns.ai_suggestion_id (FK richting voorstel).
--   Gevolg: findById's reasoning-join faalt en de "Waarom dit
--   voorstel"-card blijft leeg op concept-detail, ook voor
--   campagnes die wel degelijk uit een Filly-voorstel komen.
--
--   De write-fix landt in dezelfde sessie via approve(). Deze
--   migratie repareert de historische data.
--
-- Strategie:
--   1. Anker-koppeling: alle campaigns waarvoor een ai_suggestion
--      bestaat met approved_campaign_id = campaign.id (= directe
--      1-op-1 koppeling, zowel single-channel als de anker-
--      campagne van een multi-channel-bundle).
--   2. Bundle-siblings: campaigns die in dezelfde campaign_group
--      zitten als een anker met ai_suggestion_id. De siblings
--      kregen tot nu toe geen ai_suggestion_id omdat alleen het
--      anker via approved_campaign_id zichtbaar was.
--
-- Veiligheid op schaal:
--   - WHERE c.ai_suggestion_id IS NULL voorkomt overschrijven van
--     reeds-correcte koppelingen.
--   - Beide UPDATEs zijn idempotent (her-runs no-op).
--   - Geen schema-wijziging, geen lock-issue.
-- ============================================================

-- Stap 1 — directe approved_campaign_id-koppeling.
update public.campaigns c
set
  ai_suggestion_id = s.id,
  updated_at = now()
from public.ai_suggestions s
where c.id = s.approved_campaign_id
  and c.ai_suggestion_id is null;

-- Stap 2 — bundle-siblings overnemen van het anker. Een bundle
-- heeft alle kanalen onder hetzelfde group_id; het anker is
-- degene die via approved_campaign_id aan de suggestion hangt.
update public.campaigns c
set
  ai_suggestion_id = anchor.ai_suggestion_id,
  updated_at = now()
from public.campaigns anchor
where c.group_id = anchor.group_id
  and c.group_id is not null
  and c.id <> anchor.id
  and c.ai_suggestion_id is null
  and anchor.ai_suggestion_id is not null;
