-- ============================================================
-- 0029 — Suggested menu items (Filly menu-voorstellen)
-- ============================================================
-- Tabel voor Filly-gegenereerde gerecht-voorstellen die de eigenaar
-- kan accepteren (→ wordt menu_items-rij), afwijzen, of laten
-- verfijnen ("geef andere richting"). Gescheiden van menu_items
-- gehouden zodat voorstellen je echte menu nooit vervuilen vóór
-- de eigenaar er bewust voor heeft gekozen — Filly's prompts,
-- dashboard-counts, en exports kijken alleen naar menu_items.
--
-- Lifecycle:
--   pending → accepted    (eigenaar klikt "Toevoegen aan menu")
--   pending → rejected    (eigenaar klikt "Verwijder")
--   pending → refined_into (eigenaar vroeg om andere variant; deze
--                          rij is door een nieuwe pending vervangen)
--   pending → expired     (lazy cleanup bij fetch — ouder dan 30 dagen)
-- ============================================================

create table if not exists public.suggested_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Hoe is deze suggestie tot stand gekomen — input voor analyse
  -- ("welke source levert de meeste accepts op?"). Nuttig later voor
  -- prompt-tuning per source.
  source_type text not null check (source_type in (
    'gap_analysis',    -- vond een gat in bestaand menu (geen vis, geen vegetarisch hoofd)
    'profile_based',   -- past bij cuisine/USPs/sfeer/doelgroep
    'seasonal',        -- past bij huidig seizoen
    'refined'          -- variant van een eerder voorstel
  )),

  -- Het voorstel zelf — analoge velden als menu_items zodat we bij
  -- accept een 1-op-1 mapping kunnen doen.
  name text not null,
  description text,
  category text,        -- voorgerecht, hoofd, dessert, etc.
  subcategory text,
  -- Prijs als range (low/high in centen). Filly geeft nooit een
  -- exacte prijs want kostprijs hangt af van inkoop; eigenaar
  -- bepaalt zelf de definitieve prijs bij accept.
  price_cents_low integer,
  price_cents_high integer,
  dietary_tags text[] default '{}',

  -- Eén zin context voor de eigenaar: waarom past dit gerecht?
  -- Bv. "Aanvulling op je vegetarische hoek — je hebt nu alleen
  -- pasta vegetarisch". Maakt voorstellen niet generiek.
  reasoning text,

  -- Filly's eigen inschatting van match-kwaliteit. Vooral bedoeld
  -- om voorstellen te sorteren (high eerst); niet als hard-filter.
  confidence text check (confidence in ('high', 'medium', 'low')) default 'medium',

  -- Lifecycle
  status text not null check (status in (
    'pending', 'accepted', 'rejected', 'refined_into', 'expired'
  )) default 'pending',

  -- Wanneer eigenaar accepteerde, FK naar het echte menu_item dat
  -- daaruit voortkwam. Voor "welke voorstellen heeft Filly al
  -- aangenomen?"-statistieken zonder join op alleen status.
  accepted_menu_item_id uuid references public.menu_items(id) on delete set null,

  -- Bij een refined-voorstel: link naar het origineel waarvan dit
  -- een variant is. Helpt bij UX ("dit is variant 2 van...").
  refined_from_id uuid references public.suggested_menu_items(id) on delete set null,

  -- Cap op refines per origineel: max 3 (kostenbescherming). Wordt
  -- per origineel-rij geteld; refined-rijen erven 'm via FK-keten.
  refine_count integer not null default 0,

  expires_at timestamptz,        -- voor lazy cleanup
  created_at timestamptz default now(),
  acted_at timestamptz           -- wanneer accepted/rejected/refined
);

create index if not exists idx_suggested_menu_restaurant_status
  on public.suggested_menu_items(restaurant_id, status);

-- RLS — zelfde pattern als menu_items: alleen team-leden van het
-- restaurant mogen voorstellen zien/accepteren/afwijzen.
alter table public.suggested_menu_items enable row level security;
drop policy if exists "suggested_menu_items_access" on public.suggested_menu_items;
create policy "suggested_menu_items_access" on public.suggested_menu_items
  for all using (public.user_has_restaurant_access(restaurant_id));

comment on table public.suggested_menu_items is
  'Filly-gegenereerde gerecht-voorstellen, los van menu_items zodat ze niet meetellen in prompts/exports tot acceptatie.';
