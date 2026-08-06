-- 0068_rename_restaurant_to_business.sql
-- ============================================================
-- DEEL 2: rename restaurants/restaurant_id → businesses/business_id
-- ============================================================
-- Get-Filly bedient meerdere branches; de term "restaurant" dekt de lading
-- niet meer. Dit hernoemt het datamodel naar "business". BIG-BANG cutover:
-- draai deze migratie in hetzelfde korte venster als de code-deploy die de
-- nieuwe namen gebruikt (op een rustig moment). Vóór of ná de deploy is er
-- kort een mismatch; daarom atomair + op een dood tijdstip.
--
-- Veilig dankzij Postgres-gedrag: policies, indexes en foreign keys verwijzen
-- intern op OID (niet op naam) en lopen automatisch mee bij een kolom/tabel-
-- rename. Alleen functie-bodies (plpgsql, runtime name-resolution) herschrijven
-- we expliciet. ALTER FUNCTION ... RENAME behoudt policy/trigger-dependencies.
--
-- Alles in één transactie: mislukt er iets, dan rolt de hele rename terug.

begin;

-- ------------------------------------------------------------
-- 1. Kolom restaurant_id → business_id op ÉLKE tabel die 'm heeft.
--    Dynamisch via information_schema zodat we geen enkele tabel
--    kunnen missen (ook tabellen buiten deze migratie-set).
--    Policies/indexes/FK's op deze kolom lopen automatisch mee.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'restaurant_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'alter table public.%I rename column restaurant_id to business_id', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Tabel-namen. Policies/FK's/indexes verhuizen automatisch mee.
-- ------------------------------------------------------------
alter table public.restaurants          rename to businesses;
alter table public.restaurant_users     rename to business_users;
alter table public.restaurant_media     rename to business_media;
alter table public.restaurant_chat_memory rename to business_chat_memory;

-- ------------------------------------------------------------
-- 3. Functie-bodies herschrijven naar de nieuwe namen. CREATE OR REPLACE
--    behoudt de OID (en dus alle policy/trigger-dependencies), we fixen
--    alleen de body. Daarna hernoemen we de functie zelf.
-- ------------------------------------------------------------

-- 3a. Toegangscheck (gebruikt in ~alle RLS-policies).
create or replace function public.user_has_restaurant_access(rid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from public.business_users
    where business_id = rid and user_id = auth.uid()
  );
$$;
alter function public.user_has_restaurant_access(uuid)
  rename to user_has_business_access;

-- 3b. Rol van de ingelogde user binnen een business.
create or replace function public.user_role_in_restaurant(rid uuid)
returns text
language sql
security definer
stable
as $$
  select role
  from public.business_users
  where business_id = rid and user_id = auth.uid()
  limit 1;
$$;
alter function public.user_role_in_restaurant(uuid)
  rename to user_role_in_business;

-- 3c. Teamleden-RPC (backend roept 'm aan via .rpc('get_business_members')).
create or replace function public.get_restaurant_members(rid uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  permissions jsonb,
  created_at timestamptz
)
language sql
security definer
stable
as $$
  select
    ru.user_id,
    au.email::text,
    u.full_name,
    ru.role,
    ru.permissions,
    ru.created_at
  from public.business_users ru
  left join public.users u on u.id = ru.user_id
  left join auth.users au on au.id = ru.user_id
  where ru.business_id = rid
  order by ru.created_at;
$$;
alter function public.get_restaurant_members(uuid)
  rename to get_business_members;

-- 3d. Industry-snapshot-trigger (mig 0067). Body verwees naar restaurants
--     + new.restaurant_id; nu businesses + new.business_id. Triggers
--     verwijzen op OID → de rename raakt ze niet.
create or replace function public.set_industry_from_restaurant()
returns trigger
language plpgsql
as $$
begin
  if new.industry is null then
    select r.industry into new.industry
    from public.businesses r
    where r.id = new.business_id;
  end if;
  return new;
end;
$$;
alter function public.set_industry_from_restaurant()
  rename to set_industry_from_business;

commit;
