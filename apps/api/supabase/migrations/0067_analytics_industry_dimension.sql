-- 0067_analytics_industry_dimension.sql
-- Denormaliseer de branche op de analytics-tabellen zodat we later per
-- branche kunnen vergelijken welke uitingen/campagnes werken. Snapshot bij
-- insert (via trigger) → historisch stabiel: wisselt een zaak later van
-- branche, dan behouden bestaande rijen hun oorspronkelijke tag.
--
-- Bewust een trigger i.p.v. de kolom in elke schrijf-plek meegeven: deze
-- tabellen worden vanuit meerdere services geschreven (reservations, mail,
-- campaign-performance, fingerprint), deels met service-role, deels met de
-- user-client. Eén trigger tagt elke insert automatisch, ongeacht de bron,
-- en laat metric-updates ongemoeid (insert-only = juiste snapshot-semantiek).

alter table public.campaign_performance
  add column if not exists industry text;
alter table public.campaign_style_fingerprints
  add column if not exists industry text;

-- Backfill bestaande rijen vanuit de zaak (nu allemaal horeca).
update public.campaign_performance p
  set industry = r.industry
  from public.restaurants r
  where p.restaurant_id = r.id and p.industry is null;

update public.campaign_style_fingerprints f
  set industry = r.industry
  from public.restaurants r
  where f.restaurant_id = r.id and f.industry is null;

-- Trigger-functie: vul industry bij insert uit de zaak als 'ie leeg is.
-- SECURITY INVOKER (default): de inserter heeft altijd toegang tot z'n eigen
-- restaurant-rij (user-client via RLS, service-role bypasst RLS), dus de
-- SELECT slaagt in beide gevallen.
create or replace function public.set_industry_from_restaurant()
returns trigger
language plpgsql
as $$
begin
  if new.industry is null then
    select r.industry into new.industry
    from public.restaurants r
    where r.id = new.restaurant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cp_industry on public.campaign_performance;
create trigger trg_cp_industry
  before insert on public.campaign_performance
  for each row execute function public.set_industry_from_restaurant();

drop trigger if exists trg_csf_industry on public.campaign_style_fingerprints;
create trigger trg_csf_industry
  before insert on public.campaign_style_fingerprints
  for each row execute function public.set_industry_from_restaurant();

-- Indexen voor aggregatie per branche.
create index if not exists idx_cp_industry on public.campaign_performance(industry);
create index if not exists idx_csf_industry on public.campaign_style_fingerprints(industry);
