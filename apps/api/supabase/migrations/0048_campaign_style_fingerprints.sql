-- ============================================================
-- Get Filly — Migratie 0048
-- campaign_style_fingerprints (filly-brein hoofdstuk 8.2)
-- ============================================================
-- Achtergrond:
--   Per filly-brein hoofdstuk 8 willen we voorkomen dat Filly's
--   campagnes stilistisch op elkaar gaan lijken. Tegelijk moeten
--   anker-keywords (cuisine + stad + signature) wél consequent
--   terugkomen voor SEO. Oplossing: per goedgekeurde campagne een
--   gestructureerde fingerprint opslaan met opening / hashtag-set /
--   cta-template / tone-signature / etc.
--
--   Bij de volgende generation laadt Filly de laatste 10 fingerprints
--   en gebruikt ze als VERMIJD-context. Bij top-3 'winner'-campagnes
--   gebruikt 'ie de fingerprints juist als inspiratie.
--
-- Strategie:
--   Eén rij per goedgekeurde campagne (FK naar campaigns). Bij
--   campagne-delete cascadet de fingerprint mee. RLS via
--   user_has_restaurant_access op restaurant_id (denormalize).
-- ============================================================

create table public.campaign_style_fingerprints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Kanaal van deze fingerprint. Verschillende kanalen kunnen verschillende
  -- patronen hebben (mail vs IG vs GBP), dus we vergelijken per-kanaal.
  channel text not null check (channel in (
    'mail', 'instagram_feed', 'instagram_reels', 'instagram_stories',
    'facebook', 'tiktok', 'whatsapp', 'google_business'
  )),

  -- ============================================================
  -- Stilistische fingerprint-velden (filly-brein hfst 8.2)
  -- ============================================================

  -- Eerste 8 woorden van de body, lowercased + gestripped van leestekens.
  -- Voor lexicale vergelijking ('opening_overlap > 60% met laatste 5').
  opening_pattern text,

  -- Lowercased + sorted hashtag-set. Anker-hashtags (uit
  -- restaurants.keywords + cuisine + city) worden later geëxcludeerd
  -- in de Jaccard-similarity-berekening.
  hashtag_set text[],

  -- CTA-categorie. Gebruikt voor "max 3× zelfde cta_template"-regel.
  cta_template text check (cta_template is null or cta_template in (
    'reserveer', 'bel', 'bekijk_menu', 'vraag_in_comment',
    'bezoek', 'tag_vriend', 'save_voor_later', 'rsvp_event', 'andere'
  )),

  -- Thematische categorie van de campagne (feestdag-naam, 'rustige_dag',
  -- 'nieuw_menu', etc.). Voor cluster-analyse: welke thema's werken voor
  -- dit restaurant?
  theme text,

  -- Welk signature-gerecht stond centraal in de copy (via menu-lookup
  -- of LLM-extractie). Null als de campagne geen specifiek gerecht had.
  primary_dish_mentioned text,

  -- Verteltechniek-as voor variatie binnen 3-varianten-set.
  tone_signature text check (tone_signature is null or tone_signature in (
    'feit_eerst', 'verhaal_eerst', 'vraag_eerst', 'lijst', 'stelling'
  )),

  -- ============================================================
  -- Versie + audit
  -- ============================================================
  -- Bumpen wanneer de extractor-logica wijzigt zodat oude
  -- fingerprints duidelijk te onderscheiden zijn.
  extractor_version text not null default 'v1',

  created_at timestamptz not null default now()
);

create index idx_csf_restaurant_channel on public.campaign_style_fingerprints(restaurant_id, channel, created_at desc);
create index idx_csf_cta on public.campaign_style_fingerprints(restaurant_id, cta_template) where cta_template is not null;
create index idx_csf_theme on public.campaign_style_fingerprints(restaurant_id, theme) where theme is not null;

alter table public.campaign_style_fingerprints enable row level security;
create policy "campaign_style_fingerprints_access" on public.campaign_style_fingerprints
  for all using (public.user_has_restaurant_access(restaurant_id));
