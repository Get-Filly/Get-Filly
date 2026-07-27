-- 0065_restaurant_quiet_moments_per_week.sql
-- Tempo van de rustige-momenten-detectie, per zaak: hoeveel rustige momenten
-- Filly maximaal per week aandraagt (het plafond / de "cadans"). De detectie
-- (BusynessService.getQuietMoments) capt hierop. Default 2.

alter table restaurants
  add column if not exists quiet_moments_per_week smallint not null default 2;

-- Zinnige grenzen (1..6) zodat de detectie niet ontspoort.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurants_quiet_moments_per_week_range'
  ) then
    alter table restaurants
      add constraint restaurants_quiet_moments_per_week_range
      check (quiet_moments_per_week between 1 and 6);
  end if;
end $$;
