-- ============================================================
-- Get Filly — Migratie 0013
-- menu_items.allergens: aparte kolom voor allergenen-info
-- ============================================================
-- Probleem:
--   De onboarding-flow (Claude Vision op een menukaart) extraheert
--   allergenen per gerecht en probeerde die te inserten in een
--   kolom `allergens`. Die kolom bestond niet. De tabel had alleen
--   `dietary_tags` (vegan, vegetarisch, glutenvrij). Alle INSERTs
--   faalden daarom silent (service logde alleen een console.warn),
--   waardoor onboarding 'succesvol' leek terwijl geen enkel
--   menu-item in de DB belandde.
--
-- Waarom een aparte kolom en niet dietary_tags hergebruiken?
--   - Semantisch verschillend:
--       dietary_tags = positief label ("geschikt voor veganisten")
--       allergens    = wat erin zit dat een allergische reactie
--                      kan geven ("bevat gluten, noten, lactose")
--   - Wettelijk: EU Verordening 1169/2011 verplicht horeca om de
--     14 allergeen-categorieën te vermelden. Die info willen we
--     zuiver bewaren zodat we 'm later op de menukaart, website
--     of in campagnes correct kunnen tonen.
--   - Queryable: "toon gasten met noten-allergie geen gerechten
--     met `'noten' = any(allergens)`" — samensmelten met
--     dietary_tags zou deze filter onbetrouwbaar maken.
--
-- Conventie:
--   text[] (net als dietary_tags) zodat we flexibel blijven. Geen
--   enum: de 14 EU-categorieën kunnen uitbreiden, en we willen niet
--   per wijziging een migratie. Normalisatie doen we in de applicatie
--   (lowercase, trim, deduplicate) voor consistente waardes.
-- ============================================================

alter table public.menu_items
  add column if not exists allergens text[] default '{}';

comment on column public.menu_items.allergens is
  'Allergenen-info per gerecht (EU 1169/2011). Bevat bijvoorbeeld: gluten, lactose, noten, ei, vis, schaaldieren, soja, selderij, mosterd, sesam, sulfiet, lupine, weekdieren, pinda. Onderscheiden van dietary_tags: die zijn positieve labels (vegan, vegetarisch, glutenvrij).';
