-- ============================================================
-- Get Filly — Migratie 0041
-- Campagnes dragen hun versies + gekozen-index expliciet
-- ============================================================
-- Achtergrond:
--   Vóór deze migratie bestond het 3-versies-paradigma alleen op
--   ai_suggestions (suggested_campaign.channels[].variants +
--   selected_index). Bij goedkeuring werd de gekozen versie naar
--   campaign_*_content geschreven en de andere 2 belandden in
--   campaigns.filly_variants als 'alternatieven-cache'. Het
--   gevolg: post-approve verloor de eigenaar de "Versie 1/2/3"-
--   layout en kreeg een afwijkende detail-view.
--
--   Per 2026-05-13 willen we één unified detail-page over alle
--   statussen (voorstel/concept/ingepland/actief/afgerond) met
--   exact dezelfde "Versie 1 · Gekozen · Bewerk"-UX. Daarvoor
--   moet ook een campagne na approve haar volledige versies-set
--   + selected_index meedragen, niet alleen de gekozen body op
--   campaign_*_content.
--
-- Wat doet deze migratie:
--   1. campaigns.variants jsonb — array van { subject_line?, body }
--      identiek aan de suggestion-shape. Bron-van-waarheid voor de
--      versies-grid op de unified-detail-page.
--   2. campaigns.selected_variant_index integer — welke versie
--      is op dit moment 'Gekozen'. body op campaign_*_content
--      blijft afgeleid van variants[selected_variant_index] en
--      wordt gesynced bij elke select/edit-actie (backend-werk
--      in fase B).
--   3. Backfill bestaande campagnes:
--        variants[0] = huidige content (uit campaign_*_content)
--        variants[1..N] = bestaande filly_variants-cache
--        selected_variant_index = 0
--      Zo behoudt iedere bestaande campagne haar huidige tekst
--      én blijven Filly's alternatieven beschikbaar als versies
--      die de eigenaar alsnog kan kiezen.
--   4. Check-constraint: selected_variant_index >= 0 (geen
--      validatie op upper-bound omdat array-grootte mutable is).
--
-- Wat doet deze migratie NIET:
--   - filly_variants kolommen behoudt; oude code blijft werken
--     tot fase B/E die ze uitfaseren. Geen DROP, geen risico van
--     dataverlies.
--   - Geen RLS-wijzigingen (variants erft policies van campaigns).
--   - Geen wijziging aan ai_suggestions (variants leven daar al).
-- ============================================================

alter table public.campaigns
  add column if not exists variants jsonb not null default '[]'::jsonb,
  add column if not exists selected_variant_index integer not null default 0;

-- Negatieve index is altijd ongeldig. Upper-bound checken we
-- application-side omdat een DB-constraint over een mutable
-- jsonb-array brittle is (variants.add/remove zou de constraint
-- onnodig kunnen breken).
alter table public.campaigns
  drop constraint if exists campaigns_selected_variant_index_non_negative;
alter table public.campaigns
  add constraint campaigns_selected_variant_index_non_negative
  check (selected_variant_index >= 0);

-- ============================================================
-- Backfill — 3 UPDATE's, één per content-tabel
-- ============================================================
-- We schrijven de huidige content als 'Versie 1' (index 0) en
-- voegen daar de filly_variants-cache achter zodat alternatieven
-- die Filly eerder genereerde behouden blijven als Versie 2..N.
--
-- coalesce(..., '[]') beschermt tegen NULL-filly_variants die in
-- theorie kunnen voorkomen op pre-0014 rijen (default is '[]'
-- maar oude rijen kunnen door schema-evolutie NULL hebben).
-- Daarnaast strippen we entries zonder body — die zijn corrupt
-- en zouden de versies-grid laten breken.
-- ============================================================

-- Mail-campagnes
update public.campaigns c
set
  variants =
    jsonb_build_array(
      jsonb_build_object(
        'subject_line', m.subject_line,
        'body', coalesce(m.body_plain, '')
      )
    )
    || coalesce(
         (
           select jsonb_agg(v)
           from jsonb_array_elements(coalesce(c.filly_variants, '[]'::jsonb)) v
           where coalesce(v->>'body', '') <> ''
         ),
         '[]'::jsonb
       ),
  selected_variant_index = 0
from public.campaign_mail_content m
where m.campaign_id = c.id
  and c.type = 'mail'
  and c.variants = '[]'::jsonb;

-- Social-campagnes (Instagram/Facebook/TikTok)
update public.campaigns c
set
  variants =
    jsonb_build_array(
      jsonb_build_object('body', coalesce(s.caption, ''))
    )
    || coalesce(
         (
           select jsonb_agg(v)
           from jsonb_array_elements(coalesce(c.filly_variants, '[]'::jsonb)) v
           where coalesce(v->>'body', '') <> ''
         ),
         '[]'::jsonb
       ),
  selected_variant_index = 0
from public.campaign_social_content s
where s.campaign_id = c.id
  and c.type = 'social'
  and c.variants = '[]'::jsonb;

-- WhatsApp-campagnes
update public.campaigns c
set
  variants =
    jsonb_build_array(
      jsonb_build_object('body', coalesce(w.message_text, ''))
    )
    || coalesce(
         (
           select jsonb_agg(v)
           from jsonb_array_elements(coalesce(c.filly_variants, '[]'::jsonb)) v
           where coalesce(v->>'body', '') <> ''
         ),
         '[]'::jsonb
       ),
  selected_variant_index = 0
from public.campaign_whatsapp_content w
where w.campaign_id = c.id
  and c.type = 'whatsapp'
  and c.variants = '[]'::jsonb;

-- ============================================================
-- Comments
-- ============================================================

comment on column public.campaigns.variants is
  'Alle door Filly gegenereerde versies + eigen edits van eigenaar. Array van { subject_line?, body } in dezelfde shape als ai_suggestions.suggested_campaign.channels[].variants. Bron-van-waarheid voor de Versies-grid op de unified-detail-page; campaign_*_content.body wordt afgeleid van variants[selected_variant_index].';

comment on column public.campaigns.selected_variant_index is
  'Welke entry in variants is op dit moment de "Gekozen" versie. 0-based. Wordt gesynced met campaign_*_content.body bij elke select/edit-actie via /campaigns/:id/variant-endpoints. Mag in concept-status wijzigen; in ingepland/actief/afgerond is de campagne immutable.';
