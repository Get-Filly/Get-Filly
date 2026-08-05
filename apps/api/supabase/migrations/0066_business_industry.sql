-- 0066_business_industry.sql
-- Branche-taxonomie op de zaak. Los van de vrije `type` (subtype/positionering
-- binnen een branche, bv. "bistro" onder horeca of "dameskapsalon" onder kapper).
--
-- Vrije-tekst kolom bewust ZONDER check-constraint: de geldige waarden leven in
-- de code-registry (apps/api/src/ai/industry), validatie gebeurt in Zod. Zo is
-- een nieuwe branche toevoegen puur een code-wijziging, geen DB-migratie.
--
-- NOT NULL DEFAULT 'horeca' zet bestaande rijen in Postgres automatisch op
-- 'horeca' — geen aparte backfill nodig. Regressie-veilig: elke huidige zaak
-- blijft horeca en Filly's gedrag verandert niet.
alter table public.restaurants
  add column if not exists industry text not null default 'horeca';

comment on column public.restaurants.industry is
  'Branche-taxonomie (horeca, wellness, kapper, sportschool, ...). Stuurt Filly''s industry-pack. Bestaande rijen: horeca. Geldige waarden in code-registry (ai/industry), niet in een DB-constraint.';

-- Index: filtering/analytics per branche later (goedkoop, additief).
create index if not exists idx_restaurants_industry on public.restaurants(industry);
