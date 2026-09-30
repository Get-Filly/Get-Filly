-- 0080_quiet_disabled_slots.sql
-- "Mijn momenten": de eigenaar zet momenten (weekdag + dagdeel) uit, en Filly
-- doet daar nooit een voorstel voor. Bijvoorbeeld woensdagmiddag uit.
--
-- Opslag: een lijst per zaak van uitgezette momenten als "weekdag|dagdeel",
-- weekdag 0=ma..6=zo en dagdeel ochtend, lunch, middag of diner
-- (woensdagmiddag = '2|middag'). Leeg = alles aan (de standaard, dus het
-- huidige gedrag verandert voor niemand).
--
-- Een moment dat de eigenaar zelf kiest in de geleide flow wordt nooit
-- weggefilterd; dit geldt alleen voor wat Filly uit zichzelf voorstelt.
alter table public.businesses
  add column if not exists quiet_disabled_slots text[] not null default '{}';

-- Alleen bestaande momenten toestaan (28 geldige waarden).
alter table public.businesses
  add constraint businesses_quiet_disabled_slots_chk check (
    quiet_disabled_slots <@ array[
      '0|ochtend', '0|lunch', '0|middag', '0|diner', '1|ochtend', '1|lunch', '1|middag', '1|diner',
      '2|ochtend', '2|lunch', '2|middag', '2|diner', '3|ochtend', '3|lunch', '3|middag', '3|diner',
      '4|ochtend', '4|lunch', '4|middag', '4|diner', '5|ochtend', '5|lunch', '5|middag', '5|diner',
      '6|ochtend', '6|lunch', '6|middag', '6|diner'
    ]::text[]
  );

comment on column public.businesses.quiet_disabled_slots is
  'Momenten die de eigenaar heeft uitgezet, als "weekdag|dagdeel" (0=ma..6=zo; ochtend, lunch, middag, diner). Filly doet daar nooit een voorstel voor. Leeg = alles aan.';
