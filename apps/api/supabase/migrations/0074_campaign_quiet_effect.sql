-- ============================================================
-- 0074: campaign_quiet_effect — deed de campagne iets met de drukte?
-- ============================================================
-- Sluit de leerloop van de rustige-momenten-detectie (fase 4). Tot nu toe
-- meet het project wél hoe een UITING het deed (campaign_performance, mig
-- 0071: open-rate, doorkliks, boekingen per kanaal), maar niet of het
-- MOMENT waarvoor de campagne bedoeld was ook daadwerkelijk voller werd.
-- Dat is een andere vraag, en het is de vraag die bepaalt welke slots de
-- detectie in het vervolg moet voorstellen.
--
-- Meetdefinitie (bewust simpel en navolgbaar):
--   actual   = gemeten drukte in het doel-dagdeel op de doeldatum
--              (mediaan van live_pct per uur, daarna gemiddeld over de uren)
--   baseline = mediaan van diezelfde maat over vergelijkbare dagen: zelfde
--              weekdag, zelfde dagdeel, binnen het meetvenster, ZONDER een
--              campagne op die dag
--   lift     = actual − baseline, in drukte-punten
--
-- Waarom een eigen tabel en niet live uitrekenen: busyness_snapshots wordt
-- na 120 dagen geprund (pruneOldSnapshots). Een leerloop die alleen binnen
-- dat venster kan kijken leert nooit iets, want er gaan hooguit een paar
-- campagnes per week doorheen. Door de uitkomst per campagne vast te leggen
-- houden we de historie, ook nadat de ruwe metingen weg zijn. Bijvangst: de
-- meting is per campagne terug te zien, dus uitlegbaar naar de eigenaar.
--
-- Eén rij per campagne (unique op campaign_id): opnieuw meten overschrijft,
-- zodat de cron idempotent is.
--
-- Wees eerlijk over wat dit NIET is: er is geen controlegroep. Weer, een
-- evenement of een feestdag op de doeldatum bewegen de drukte net zo goed.
-- Daarom werkt de detectie met de MEDIAAN over meerdere campagnes per slot
-- en pas vanaf een minimum aantal metingen; één uitschieter mag niet sturen.

create table if not exists public.campaign_quiet_effect (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,

  -- Het moment waarvoor de campagne bedoeld was. Komt uit
  -- ai_suggestions.trigger_context (target_date + target_daypart), via
  -- campaigns.ai_suggestion_id.
  target_date date not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0=ma..6=zo
  daypart text not null, -- ochtend|lunch|middag|diner|avond

  -- De meting zelf. Alle drie null = we konden niet meten (te weinig
  -- live-data); de rij bestaat dan tóch, zodat de cron 'm niet elke nacht
  -- opnieuw probeert.
  actual_pct numeric(5, 2),
  baseline_pct numeric(5, 2),
  lift numeric(6, 2),

  -- Hoeveel vergelijkbare dagen de baseline droeg, en hoeveel uur van het
  -- dagdeel er op de doeldatum gemeten is. Voor de betrouwbaarheid: een
  -- baseline op 3 dagen zegt minder dan een op 12.
  baseline_days smallint not null default 0,
  measured_hours smallint not null default 0,

  measured_at timestamptz not null default now(),

  unique (campaign_id)
);

comment on table public.campaign_quiet_effect is
  'Per campagne: werd het dagdeel waarvoor hij bedoeld was ook echt voller? actual − baseline in drukte-punten. Voedt de slot-weging in getQuietMoments (fase 4).';
comment on column public.campaign_quiet_effect.lift is
  'actual_pct − baseline_pct, in drukte-punten. Positief = voller dan vergelijkbare dagen. Geen controlegroep, dus alleen zinvol als mediaan over meerdere campagnes.';
comment on column public.campaign_quiet_effect.baseline_days is
  'Aantal vergelijkbare dagen (zelfde weekdag+dagdeel, zonder campagne) waarop de baseline rust.';
comment on column public.campaign_quiet_effect.measured_hours is
  'Aantal uren van het dagdeel met een live-meting op de doeldatum.';

-- De detectie leest per zaak alle slots op; dit is de enige leespatroon.
create index if not exists idx_cqe_slot
  on public.campaign_quiet_effect (business_id, weekday, daypart);

-- De cron zoekt campagnes die nog niet gemeten zijn.
create index if not exists idx_cqe_campaign
  on public.campaign_quiet_effect (campaign_id);

-- RLS aan zonder policies: net als busyness_snapshots is dit afgeleide
-- meetdata die alleen de service-role schrijft én leest. De detectie draait
-- op de service-role-client; er is geen endpoint dat deze tabel direct aan
-- de browser geeft.
alter table public.campaign_quiet_effect enable row level security;
