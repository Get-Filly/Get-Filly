-- ============================================================
-- Demo-seed: uitingen met performance voor de rapportagepagina
-- ============================================================
-- Doel: het demo-restaurant een gevulde rapportage geven, zodat je aan
-- klanten kunt laten zien wat de pagina doet. Bewust ECHTE rijen in de
-- database en géén mockdata in de frontend: de pagina blijft daarmee
-- eerlijk (hij leest gewoon campaign_performance_report), en een nieuw
-- account ziet vanzelf niets, want die heeft deze rijen niet.
--
-- Bedrijf: Demo Bistro (71ecad93-4ccb-436c-833e-0c682bd30cc4).
--   Wil je een ander demo-bedrijf vullen, pas alleen v_business aan.
--
-- Wat je krijgt over de laatste 30 dagen (= de standaard-selectie):
--   14 uitingen · 41.200 bereik · 1.093 doorkliks · 63 boekingen
--   €4.410 omzet · €285 advertentiebudget · €11,88 per boeking
--   5 nog niet beoordeeld (meet-window van 14 dagen), 9 met een score
-- En 4 oudere uitingen, zodat de 90-dagen-selectie ook wat laat zien én
-- de vergelijking "vs vorige 30 dagen" een echt getal oplevert.
--
-- Alle rijen krijgen tag 'demo-seed'. Weghalen doe je met het statement
-- onderaan dit bestand; campaign_social_content en campaign_performance
-- gaan mee via de cascade op campaign_id.
--
-- Idempotent: het script verwijdert eerst z'n eigen vorige seed. Veilig
-- om opnieuw te draaien.
-- ============================================================

do $$
declare
  v_business uuid := '71ecad93-4ccb-436c-833e-0c682bd30cc4';
begin

-- Eerst de vorige seed weg, anders krijg je bij een tweede run dubbele
-- uitingen in de rapportage.
delete from public.campaigns
where business_id = v_business
  and 'demo-seed' = any(tags);

with seed(
  naam, kanaal, dagen_terug, betaald,
  bereik, kliks, interacties, boekingen, budget_cents,
  oordeel, score, basis
) as (
  values
  -- ---- Nog binnen het meet-window van 14 dagen: geen oordeel ----
  ('Weekend-teaser met terrasfoto',       'instagram',       1,  true,  3600,  96, 210, 4, 4000, null,             null, null),
  ('Donderdag-deal, drie gangen',         'instagram',       4,  true,  4820, 143, 289, 5, 4500, null,             null, null),
  ('Achter de schermen in de keuken',     'tiktok',          6,  false, 3100,  38, 402, 5,    0, null,             null, null),
  ('Nieuw op de kaart, burrata',          'facebook',        9,  true,  5240, 121, 188, 6, 5000, null,             null, null),
  ('Update: verlengde terrasuren',        'google_business', 12, false, 1740,  96,  24, 5,    0, null,             null, null),
  -- ---- Ouder dan 14 dagen: wél een score ----
  ('Rustige woensdagmiddag',              'instagram',       16, false, 2960,  71, 244, 6,    0, 'winner',           78, 'conversion_only'),
  ('Zo maken we onze pasta',              'youtube',         18, false, 1200,  34,  88, 2,    0, 'average',          50, 'conversion_only'),
  ('Weekend-borrel aankondiging',         'facebook',        20, false, 3410,  84, 196, 8,    0, 'winner',           84, 'conversion_only'),
  ('Wat is er vandaag, foto van de dag',  'google_business', 21, false, 1420,  58,  18, 4,    0, 'average',          55, 'rate'),
  ('Late-boeker reel',                    'instagram',       23, true,  2040,  62, 121, 2, 3500, 'underperformer',   32, 'conversion_only'),
  ('Sfeerbeelden vrijdagavond',           'tiktok',          25, true,  5500, 116, 640, 4, 7000, 'underperformer',   35, 'conversion_only'),
  ('Herfstmenu teaser',                   'instagram',       26, false, 1980,  40, 167, 7,    0, 'winner',           92, 'conversion_only'),
  ('Buurtactie, 3 km rondom',             'facebook',        28, true,  3250, 100, 174, 3, 4500, 'average',          48, 'conversion_only'),
  ('Openingstijden feestdagen',           'google_business', 29, false,  940,  34,  11, 2,    0, 'average',          52, 'rate'),
  -- ---- Ouder dan 30 dagen: alleen in de 90-dagen-selectie ----
  ('Zomeravond op het terras',            'facebook',        35, false, 2800,  61, 152, 4,    0, 'winner',           76, 'conversion_only'),
  ('Aspergeweek, laatste kans',           'instagram',       48, true,  3100,  88, 198, 3, 3000, 'average',          52, 'conversion_only'),
  ('Vakantie-openingstijden',             'tiktok',          62, false, 2400,  31, 288, 2,    0, 'underperformer',   30, 'conversion_only'),
  ('Nieuwe wijnkaart',                    'instagram',       88, false, 1700,  36, 140, 3,    0, 'average',          50, 'conversion_only')
),
-- Campagne-header. type='social' voor álle kanalen: het echte kanaal
-- staat in campaign_social_content.platforms[] (zie migratie 0071),
-- en Google Business rijdt daar ook op mee.
ins_campagnes as (
  insert into public.campaigns (
    business_id, name, type, status,
    executed_at, scheduled_for, tags, budget_cents, created_at, updated_at
  )
  select
    v_business,
    s.naam,
    'social',
    'afgerond',
    now() - (s.dagen_terug || ' days')::interval,
    now() - (s.dagen_terug || ' days')::interval,
    array['demo-seed'],
    nullif(s.budget_cents, 0),
    now() - (s.dagen_terug || ' days')::interval,
    now() - (s.dagen_terug || ' days')::interval
  from seed s
  returning id, name
),
-- Content-rij: de caption is kort gehouden, want de rapportage toont
-- alleen de naam. platforms[1] is wat de view als kanaal teruggeeft.
ins_content as (
  insert into public.campaign_social_content (
    campaign_id, caption, platforms, hashtags, published_at
  )
  select
    c.id,
    s.naam,
    array[s.kanaal],
    '{}'::text[],
    now() - (s.dagen_terug || ' days')::interval
  from ins_campagnes c
  join seed s on s.naam = c.name
  returning campaign_id
)
-- Performance-rij. Per kanaal-familie vullen we de kolommen die de view
-- voor dát kanaal uitleest: social_* voor de sociale kanalen, gbp_* voor
-- Google Business. Verkeerde kolom vullen = een lege cel in de UI.
insert into public.campaign_performance (
  campaign_id, business_id,
  social_reach, social_engagement, link_clicks,
  gbp_impressions, gbp_clicks, gbp_calls, gbp_directions,
  reservations_attributed, guests_attributed, revenue_attributed_cents,
  spend_cents, paid,
  classification, success_score, score_basis, measurement_complete_at,
  created_at, updated_at
)
select
  c.id,
  v_business,
  case when s.kanaal = 'google_business' then null else s.bereik end,
  case when s.kanaal = 'google_business' then null else s.interacties end,
  case when s.kanaal = 'google_business' then null else s.kliks end,
  case when s.kanaal = 'google_business' then s.bereik end,
  case when s.kanaal = 'google_business' then s.kliks end,
  -- Bellen en route-clicks samen = wat de view als 'interacties' toont.
  case when s.kanaal = 'google_business' then floor(s.interacties / 2.0)::int end,
  case when s.kanaal = 'google_business' then s.interacties - floor(s.interacties / 2.0)::int end,
  s.boekingen,
  -- Gemiddeld 2,2 gasten per boeking, €31,80 per gast ≈ €70 per boeking.
  round(s.boekingen * 2.2)::int,
  s.boekingen * 7000,
  s.budget_cents,
  s.betaald,
  s.oordeel,
  s.score,
  s.basis,
  -- Alleen gescoorde rijen hebben een afgerond meet-window. De rest laat
  -- de nachtelijke job (pg_cron 03:17 UTC) zelf oppakken zodra ze 14
  -- dagen oud zijn — dat is precies het gedrag dat we willen demonstreren.
  case when s.oordeel is not null
    then now() - (s.dagen_terug || ' days')::interval + interval '14 days' end,
  now() - (s.dagen_terug || ' days')::interval,
  now() - (s.dagen_terug || ' days')::interval
from ins_campagnes c
join seed s on s.naam = c.name;

end $$;

-- ------------------------------------------------------------
-- Controle
-- ------------------------------------------------------------
-- Verwacht over 30 dagen: 14 uitingen, 41200 bereik, 1093 kliks,
-- 63 boekingen, 441000 cent omzet, 28500 cent budget.
select
  count(*)                       as uitingen,
  sum(coalesce(reach, 0))        as bereik,
  sum(coalesce(clicks, 0))       as doorkliks,
  sum(bookings)                  as boekingen,
  sum(revenue_cents)             as omzet_cent,
  sum(spend_cents)               as budget_cent,
  count(*) filter (where paid)   as betaald
from public.campaign_performance_report
where business_id = '71ecad93-4ccb-436c-833e-0c682bd30cc4'
  and happened_at >= now() - interval '30 days';

-- ------------------------------------------------------------
-- Weghalen (campaign_social_content + campaign_performance gaan mee
-- via de cascade op campaign_id)
-- ------------------------------------------------------------
-- delete from public.campaigns
-- where business_id = '71ecad93-4ccb-436c-833e-0c682bd30cc4'
--   and 'demo-seed' = any(tags);
