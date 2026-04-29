-- ============================================================
-- Get Filly — Migratie 0014
-- Cache van Filly-varianten op campaigns en reviews
-- ============================================================
-- Probleem:
--   De "3 alternatieven"-flow (zowel concept-campagne-edit als
--   review-reactie) genereert varianten via Claude. Bij elke
--   page-load opnieuw genereren = onbeperkt veel API-calls per
--   item, dus oncontroleerbare kosten op schaal.
--
-- Oplossing:
--   Per item slaan we de gegenereerde varianten op in een jsonb-
--   array en houden een teller bij hoe vaak de eigenaar 'opnieuw'
--   heeft geklikt. Backend-logica:
--     - count = 0 → genereer 3 + sla op + count = 1
--     - count = 1 → genereer 3 nieuwe + voeg toe (totaal 6) + count = 2
--     - count >= 2 → weiger; eigenaar moet handmatig bewerken
--   Bij body-wijziging op een campagne wissen we de cache + reset
--   count zodat varianten passen bij de nieuwe inhoud.
--
-- Waarom geen aparte tabel:
--   Varianten horen bij precies één campagne / review. 1-op-veel-
--   relatie zonder eigen audit-log overschot is overhead. Twee
--   simpele jsonb-velden + count zijn de minimaal-werkende vorm.
--
-- Shape van filly_variants:
--   [
--     { "body": "...", "subject_line": "..." },  -- mail
--     { "body": "..." }                            -- social/whatsapp/review
--   ]
-- ============================================================

alter table public.campaigns
  add column if not exists filly_variants jsonb default '[]'::jsonb,
  add column if not exists filly_variants_regen_count integer not null default 0;

alter table public.reviews
  add column if not exists filly_variants jsonb default '[]'::jsonb,
  add column if not exists filly_variants_regen_count integer not null default 0;

comment on column public.campaigns.filly_variants is
  'Gecachte 3-of-6 alternatieve versies (subject_line + body). Voorkomt herhaalde Claude-calls bij her-bezoek van de detail-page. Wordt geleegd bij body-wijziging via PATCH /campaigns/:id.';

comment on column public.campaigns.filly_variants_regen_count is
  'Hoe vaak Filly al alternatieven heeft gegenereerd voor deze campagne. 0 = nooit, 1 = initiele set, 2 = inclusief +3 extra. Gelimiteerd op 2 voor kostenbeheersing.';

comment on column public.reviews.filly_variants is
  'Gecachte 3-of-6 reactie-varianten van Filly voor deze review. Reviews zijn immutable (komen van extern), dus invalidatie niet nodig.';

comment on column public.reviews.filly_variants_regen_count is
  'Hoe vaak Filly al alternatieve reacties heeft gegenereerd voor deze review. Gelimiteerd op 2.';
