-- ============================================================
-- Get Filly — Migratie 0016
-- Tijdstip-suggestie van Filly per campagne
-- ============================================================
-- Doel:
--   Voor elk type campagne (mail/social/whatsapp) zijn er andere
--   "ideale" verzendmomenten. Mail-open-rate piekt 's ochtends
--   tussen 9 en 10; social peakt 18-20u; whatsapp 's avonds 19-21.
--   Dit verschilt ook per doelgroep (gezinnen vroeg, jongeren laat)
--   en restaurant-type. Filly kan op basis daarvan een gericht
--   voorstel doen — beter dan een random default.
--
-- Ontwerp:
--   - suggested_scheduled_for: door Filly voorgestelde datetime.
--     Read-only voor de eindgebruiker; pas aanpasbaar via een
--     nieuwe Filly-call ("genereer opnieuw").
--   - suggested_scheduled_reasoning: NL-tekst waarom Filly dit
--     tijdstip kiest, getoond in de UI naast het voorstel zodat
--     de eigenaar de keuze begrijpt.
--   - scheduled_for (bestond al): de DEFINITIEVE plaatsings-tijd.
--     Door eigenaar bevestigd of handmatig gewijzigd. Bij
--     status='ingepland' is dit de tijd waarop verzending start.
--
-- Lifecycle:
--   1. Campagne wordt aangemaakt → suggested_* leeg
--   2. Eerste open van detail-page → backend genereert voorstel
--      → suggested_* gevuld
--   3. Eigenaar accepteert → scheduled_for = suggested_scheduled_for
--   4. Eigenaar wijzigt zelf → scheduled_for = handmatige waarde
--
-- Bij body-wijziging laten we het voorstel bewust staan: het
-- tijdstip hangt vooral af van type + doelgroep, niet van content.
-- ============================================================

alter table public.campaigns
  add column if not exists suggested_scheduled_for timestamptz,
  add column if not exists suggested_scheduled_reasoning text;

comment on column public.campaigns.suggested_scheduled_for is
  'Door Filly voorgesteld verzendmoment. Wordt eenmalig gegenereerd bij eerste detail-page-open en blijft staan tot opnieuw gegenereerd. Eigenaar kan accepteren (kopieert naar scheduled_for) of zelf overschrijven.';

comment on column public.campaigns.suggested_scheduled_reasoning is
  'NL-tekst waarom Filly dit moment koos (bv. "mail-open-rates piekten in jouw segment op donderdagochtend 9:30").';
