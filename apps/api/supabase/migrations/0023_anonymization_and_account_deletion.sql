-- ============================================================
-- Get Filly — Migratie 0023
-- AVG art. 17 (right to be forgotten) + GDPR Recital 26
-- (echte anonimisering voor benchmark-leerschat)
-- ============================================================
-- Context:
--   We bouwen een account-delete-flow waarbij eigenaren hun
--   gegevens permanent kunnen laten wissen. Maar: succesvolle
--   marketing-uitingen willen we behouden als geanonimiseerde
--   leer-data ("italiaanse zaken in NH met thema X presteerden
--   25% beter") zodat Filly betere voorstellen kan doen voor
--   nieuwe klanten.
--
--   GDPR Recital 26 zegt: anonieme data valt buiten de AVG, MAAR
--   alleen als die de 3 herleidbaarheids-tests doorstaat:
--     1. Singling-out — kun je 1 individu/restaurant herkennen?
--     2. Linkability — kun je 2 records aan elkaar koppelen?
--     3. Inference — kun je iets afleiden via combinatie?
--
--   Daarom slaan we hier ALLEEN gegeneraliseerde meta op:
--     - cuisine + restaurant-type
--     - region = provincie (niet stad/postcode)
--     - capacity-bucket (klein/middel/groot, geen exacte stoelen)
--     - month-of-year (geen exacte datum)
--     - GEEN body-tekst, GEEN naam, GEEN restaurant_id, GEEN FK
--
--   Body-tekst en gerichtere patroon-extractie komen in fase 2,
--   met LLM-gebaseerde PII-stripping en jurist-review.
-- ============================================================

-- ============================================================
-- 1. campaign_benchmarks
--    Leerschat: één rij per afgeronde campagne, geanonimiseerd.
-- ============================================================
create table if not exists public.campaign_benchmarks (
  id uuid primary key default gen_random_uuid(),

  -- Restaurant-archetype (gegeneraliseerd, niet herleidbaar)
  restaurant_type text,                 -- 'bistro' | 'fine_dining' | 'café' | etc.
  cuisine_style text[],                 -- ['italian'] / ['french','fusion']
  region text,                          -- provincie-naam, bv. 'Noord-Holland' (NIET stad)
  capacity_bucket text
    check (capacity_bucket in ('small','medium','large','unknown'))
    default 'unknown',                  -- small <30, medium 30-79, large 80+
  price_range smallint
    check (price_range between 1 and 4),
  brand_tone text,                      -- 'casual' | 'professional' | 'playful'
  has_terrace boolean,
  has_kids_menu boolean,

  -- Campagne-archetype (geen body, geen subject — vrije tekst is
  -- te risicovol voor PII-lekkage zonder LLM-stripping)
  campaign_type text
    check (campaign_type in ('mail','social','whatsapp')) not null,
  theme_tags text[] default '{}',       -- uit campaigns.tags
  has_media boolean default false,      -- of er een foto bij zat
  month_of_year smallint
    check (month_of_year between 1 and 12),
  weekday_of_send smallint
    check (weekday_of_send between 0 and 6), -- 0=zondag, 6=zaterdag

  -- Resultaat-signaal (jsonb voor flexibiliteit; mag null zijn als
  -- nog geen send-engine attributie heeft geleverd)
  success_metrics jsonb default '{}'::jsonb,
  -- Verwachte vorm later: { extra_reservations: 7, revenue_cents: 84000,
  -- attributed_guests: 12, open_rate: 0.34, click_rate: 0.08 }

  -- Audit (alleen aanmaak-tijd, géén user/restaurant FK — bewust)
  created_at timestamptz default now()
);

-- Lookup-index voor de meest waarschijnlijke query-patronen
-- (Filly zoekt benchmarks per restaurant-archetype + campagne-type
-- om aanbevelingen te onderbouwen).
create index if not exists idx_campaign_benchmarks_lookup
  on public.campaign_benchmarks(restaurant_type, campaign_type, region);

comment on table public.campaign_benchmarks is
  'GDPR Recital 26: geanonimiseerde uitkomsten van afgeronde campagnes voor Filly''s leer-loop. Géén FK naar restaurants/campaigns/users — anonimisering is permanent en niet-omkeerbaar.';

-- ============================================================
-- 2. account_deletions
--    Verantwoordingsplicht (AVG art. 30 + art. 5 lid 2): bewijs
--    dat verwijderingsverzoeken verwerkt zijn. Bewust GEEN PII —
--    alleen datum + tellers zodat we kunnen aantonen dát we
--    verzoeken honoreren, zonder zelf nieuwe persoonsdata aan
--    te leggen.
-- ============================================================
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz default now(),
  restaurants_deleted_count int default 0,
  campaigns_anonymized_count int default 0,
  -- Optionele context: 'self_service' | 'support_request' | 'auto_inactive'
  reason text default 'self_service'
);

comment on table public.account_deletions is
  'AVG art. 30 verantwoordingsplicht: bewijsregister dat verwijderingsverzoeken verwerkt zijn. Bevat geen persoonsgegevens — alleen datum + tellers.';

-- ============================================================
-- 3. RLS
--    campaign_benchmarks: alleen service_role (backend) leest/
--    schrijft. Frontend krijgt alleen aggregaten via dedicated
--    endpoints — nooit ruwe rijen.
--    account_deletions: idem, dit is intern audit-materiaal.
-- ============================================================
alter table public.campaign_benchmarks enable row level security;
alter table public.account_deletions   enable row level security;

-- Geen policies = niemand mag erbij behalve service_role (die
-- bypasst RLS). Dat is hier de bedoeling.
