-- ============================================================
-- 0053: events — lokale evenementen voor het social-posting-brein
-- ============================================================
-- Wekelijkse sync uit de evenementen.nl-sitemaps (EventsSyncService,
-- Vercel Cron di 04:00). Slugs bevatten naam + plaats + datum; de
-- plaats wordt via PDOK (woonplaats-niveau) gegeocodeerd zodat we
-- per restaurant op afstand kunnen matchen (staffel per categorie:
-- kermis/markt 2 km, concert/sport/event 5 km, festival 10 km).
--
-- Gedeelde, niet-restaurant-gescopete data: lezen mag elke
-- ingelogde gebruiker, schrijven doet alleen de service-role.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  -- Bron + slug = dedupe-sleutel én herleidbare bron-URL
  -- (https://evenementen.nl/events/<source_slug>).
  source text not null default 'evenementen_nl',
  source_slug text not null,
  name text not null,
  -- Sitemap-categorie: festivals | concerten_theater | events |
  -- sportevenementen | kermis | markten.
  category text not null,
  -- Plaatsnaam zoals uit de slug herleid (lowercase, koppeltekens),
  -- null zolang de plaats-resolutie nog niet gelukt is.
  place text,
  starts_on date not null,
  -- Coördinaten van de PLAATS (woonplaats-centroïde via PDOK), niet
  -- van de venue. Voor de staffel-radii (2-10 km) is dat precies
  -- genoeg en het scheelt detail-pagina's scrapen.
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_slug)
);

create index if not exists idx_events_starts_on on public.events (starts_on);
create index if not exists idx_events_unresolved
  on public.events (starts_on)
  where latitude is null;

alter table public.events enable row level security;

create policy events_select_authenticated
  on public.events for select
  to authenticated
  using (true);

-- ============================================================
-- event_places: geocode-cache per plaatsnaam-kandidaat
-- ============================================================
-- 1 PDOK-call per unieke kandidaat, daarna voor altijd cache.
-- found=false cachet óók mislukte lookups (slug-tokens die geen
-- plaats blijken, bv. "centrum") zodat we PDOK niet blijven
-- hervragen. Alleen service-role leest/schrijft hier — geen
-- policies nodig.

create table if not exists public.event_places (
  place text primary key,
  found boolean not null default false,
  -- Woonplaats-naam zoals PDOK 'm kent (genormaliseerd, eerste deel
  -- van de weergavenaam). Nodig voor de exact-match-check: fuzzy
  -- PDOK-matches ("zee" → Zeeland) mogen alleen als fallback dienen.
  matched_name text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geocoded_at timestamptz not null default now()
);

alter table public.event_places enable row level security;
