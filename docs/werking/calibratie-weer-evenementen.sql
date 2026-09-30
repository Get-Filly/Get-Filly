-- ============================================================
-- Calibratie van de datum-signalen: klopt het weer en het evenement-effect?
-- ============================================================
-- Alleen lezen, veilig om te draaien in de Supabase SQL Editor.
-- Draai dit zodra er ongeveer 60 dagen dagoverzicht is (busyness_daily,
-- mig 0079). Eerder zijn de aantallen per klasse te klein om iets uit af te
-- leiden: kijk altijd naar de kolom "dagen".
--
-- Idee: per dag delen we de gemeten drukte door wat het Google-patroon
-- verwachtte. Een verhouding van 1,00 = precies zoals verwacht. Als de
-- literatuurwaarden in de code kloppen, zien we bij regen ongeveer 0,85 ten
-- opzichte van een gewone dag, bij terrasweer ongeveer 1,10 tot 1,25.

-- 1. Weer: de verhouding gemeten/verwacht per weerklasse.
--    De klassen volgen dezelfde volgorde als de code (hitte, regen, koud, terrasweer).
with dag as (
  select b.business_id, b.day,
         avg(b.actual_pct) / nullif(avg(b.expected_pct), 0) as ratio,
         count(*) as uren
  from public.busyness_daily b
  where b.expected_pct > 0 and b.actual_pct is not null
  group by b.business_id, b.day
  having count(*) >= 4
),
klasse as (
  select d.*,
         case
           when x.temp_max > 30 then 'hitte (>30 graden)'
           when x.weather_code >= 95 or x.weather_code between 61 and 82 then 'regen of buien'
           when x.temp_max <= 8 then 'koud (max 8 graden of lager)'
           when x.weather_code <= 2 and x.temp_max >= 22 then 'terrasweer (droog, 22 graden of meer)'
           else 'overig'
         end as weerklasse
  from dag d
  join public.busyness_day_context x
    on x.business_id = d.business_id and x.day = d.day
  where x.weather_code is not null
),
mediaan as (
  select weerklasse, count(*) as dagen,
         (percentile_cont(0.5) within group (order by ratio))::numeric as ratio
  from klasse group by weerklasse
)
select m.weerklasse,
       m.dagen,
       round(m.ratio, 3) as mediaan_gemeten_door_verwacht,
       round(m.ratio / nullif(o.ratio, 0), 3) as t_o_v_gewone_dag,
       case m.weerklasse
         when 'hitte (>30 graden)' then 0.90
         when 'regen of buien' then 0.85
         when 'koud (max 8 graden of lager)' then 0.88
         when 'terrasweer (droog, 22 graden of meer)' then 1.10  -- 1,25 met terras
         else 1.00
       end as factor_in_de_code
from mediaan m
cross join (select ratio from mediaan where weerklasse = 'overig') o
order by m.weerklasse;

-- 2. Evenementen: dagen met een evenement in de buurt tegenover dagen zonder.
with dag as (
  select b.business_id, b.day,
         avg(b.actual_pct) / nullif(avg(b.expected_pct), 0) as ratio
  from public.busyness_daily b
  where b.expected_pct > 0 and b.actual_pct is not null
  group by b.business_id, b.day
  having count(*) >= 4
)
select
  case
    when jsonb_array_length(x.events) = 0 then 'geen evenement'
    when (select min((e ->> 'distanceKm')::numeric) from jsonb_array_elements(x.events) e) <= 1 then 'evenement binnen 1 km'
    else 'evenement verder weg'
  end as situatie,
  count(*) as dagen,
  round((percentile_cont(0.5) within group (order by d.ratio))::numeric, 3) as mediaan_gemeten_door_verwacht
from dag d
join public.busyness_day_context x
  on x.business_id = d.business_id and x.day = d.day
group by 1
order by 1;
