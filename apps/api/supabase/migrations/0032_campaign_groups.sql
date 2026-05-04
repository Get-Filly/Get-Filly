-- ============================================================
-- 0032 — Campaign groups (multi-channel bundles)
-- ============================================================
-- Filly stelt soms 1 thema voor over meerdere kanalen tegelijk:
-- bv. moederdag → mail + Instagram + Facebook met elk een eigen
-- caption-stijl. Een 'group' bundelt die kind-campagnes onder één
-- naam zodat eigenaar:
--   - in chat 1 voorstel ziet met 3 collapsibles
--   - in 1 actie 3 campagnes accepteert
--   - per kanaal kan beslissen wanneer te pushen
--
-- Datamodel-keuze (Optie A uit overleg 2026-05-04):
-- bestaande `campaigns`-rijen krijgen een optionele `group_id`. Eén
-- campagne = nog steeds één type. Dat houdt de send/publish-flow,
-- KPI's en attributie per kanaal werkbaar — group is alleen een
-- aggregaat-ankerpunt voor UI en accept-flow.
-- ============================================================

create table if not exists public.campaign_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Werknaam voor de hele bundel ("Moederdag-bundel"). Eigenaar ziet
  -- dit in de campagnes-pagina als ouder-rij; de individuele kind-
  -- campagnes hebben hun eigen specifieke naam ("Moederdag mail-uit",
  -- "Moederdag IG-post").
  name text not null,

  -- Eén thema-zin die de bundel verbindt. Filly genereert dit zodat
  -- het over alle kanalen consistent blijft. Bv. "Vier moederdag bij
  -- ons met een 3-gangen-arrangement op zondag 11 mei".
  theme text,

  -- Wie heeft de bundel aangemaakt (via accept-flow uit een chat-
  -- proposal). Voor audit + 'aangemaakt door X'-display.
  created_by uuid references public.users(id) on delete set null,

  created_at timestamptz default now()
);

create index if not exists idx_campaign_groups_restaurant
  on public.campaign_groups(restaurant_id, created_at desc);

-- Optionele FK op campaigns naar de groep waar 'ie bij hoort.
-- Nullable: bestaande single-channel campagnes hebben geen group_id.
alter table public.campaigns
  add column if not exists group_id uuid
    references public.campaign_groups(id) on delete set null;

create index if not exists idx_campaigns_group
  on public.campaigns(group_id) where group_id is not null;

-- RLS — zelfde pattern als campaigns: team-toegang via restaurant_id.
alter table public.campaign_groups enable row level security;
drop policy if exists "campaign_groups_access" on public.campaign_groups;
create policy "campaign_groups_access" on public.campaign_groups
  for all using (public.user_has_restaurant_access(restaurant_id));

comment on table public.campaign_groups is
  'Bundel van meerdere campagnes (mail + IG + FB) onder 1 thema. Filly genereert ze in 1 chat-voorstel; eigenaar accepteert ze in 1 actie maar kan per kanaal afzonderlijk pushen/ inplannen.';
