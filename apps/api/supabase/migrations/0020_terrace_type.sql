-- ============================================================
-- 0020 — Terras-type: open, overdekt of overdekbaar
-- ============================================================
-- Filly maakt onderscheid tussen weer-scenario's. Een open terras is
-- alleen bruikbaar bij droog weer; een overdekt terras werkt het hele
-- seizoen door; een "overdekbaar" terras (uitschuifbare luifel,
-- glas-schuifwanden, verwarmde overkapping) is een tussenvariant
-- waarmee je bij regen wél door kunt — Filly kan dat actief in een
-- campagne benoemen ("ook bij buitje gewoon op het terras").
--
-- Waarden:
--   - 'open'         : geen overkapping; alleen bij droog weer
--   - 'covered'      : permanent overdekt (luifel, glasdak, terras-tent)
--   - 'convertible'  : kan overdekt worden (zonnescherm met regenstand,
--                      glas-schuifwanden, parasol-systeem)
--
-- Nullable: alleen relevant als has_terrace=true. Restaurants zonder
-- terras zetten 'm op null en Filly negeert het.

alter table public.restaurants
  add column if not exists terrace_type text
  check (
    terrace_type is null
    or terrace_type in ('open', 'covered', 'convertible')
  );
