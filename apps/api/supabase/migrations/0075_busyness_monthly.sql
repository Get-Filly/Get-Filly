-- ============================================================
-- 0075: busyness_monthly — maandoverzicht dat de prune overleeft
-- ============================================================
-- Waarom deze tabel bestaat:
--   busyness_snapshots houdt de ruwe live-metingen 120 dagen vast en gooit
--   ze daarna weg (pruneOldSnapshots). Dat is prima voor de detectie, die
--   alleen naar de afgelopen weken kijkt. Maar het betekent ook dat we elke
--   week data vernietigen die we over een jaar nodig hebben: "hoe zat het
--   vorig jaar deze maand" is met een venster van vier maanden per definitie
--   onbeantwoordbaar. Precies daarom stonden die percentages op de
--   rapportagepagina hardgecodeerd.
--
--   Dit maandoverzicht wordt weggeschreven VÓÓR de prune. Het is klein
--   (hooguit 7×24 rijen per zaak per maand, in de praktijk ~60-80 omdat
--   alleen open uren meetellen), dus een jaar historie kost een paar
--   honderd rijen per zaak. Over twaalf maanden kan de rapportage dan echt
--   met vorig jaar vergelijken.
--
-- Wat er per rij in staat:
--   actual_pct   = de gemeten drukte: per (datum, uur) eerst de mediaan van
--                  de metingen in dat uur, daarna de mediaan over de dagen
--                  van die maand. Dezelfde definitie als de rapportage.
--   expected_pct = wat het Google-weekpatroon voor dat uur zei op het moment
--                  van wegschrijven. Bewust meebewaard: het patroon
--                  verschuift met de tijd, en zonder de verwachting van tóén
--                  is een vergelijking met vorig jaar niet uit te leggen.
--   days         = op hoeveel dagen de mediaan rust. Een maand met drie
--                  gemeten dinsdagen zegt minder dan een met vijf, en dat
--                  moet de rapportage kunnen tonen.
--
-- `month` is altijd de eerste van de maand (date_trunc), zodat de sleutel
-- eenduidig is. Upsert op de volledige sleutel: opnieuw draaien overschrijft
-- en de rollup is dus idempotent.

create table if not exists public.busyness_monthly (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  month date not null, -- altijd de 1e van de maand
  weekday smallint not null check (weekday between 0 and 6), -- 0=ma..6=zo
  hour smallint not null check (hour between 0 and 23),

  actual_pct numeric(5, 2),
  expected_pct numeric(5, 2),
  days smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (business_id, month, weekday, hour)
);

comment on table public.busyness_monthly is
  'Maandoverzicht van de drukte per weekdag+uur, weggeschreven vóór de prune van busyness_snapshots. Maakt vergelijken met vorig jaar mogelijk zodra er twaalf maanden historie is.';
comment on column public.busyness_monthly.actual_pct is
  'Gemeten drukte: per uur de mediaan van de metingen, daarna de mediaan over de dagen van de maand.';
comment on column public.busyness_monthly.expected_pct is
  'Wat het Google-weekpatroon voor dat uur zei toen deze rij geschreven werd. Het patroon verschuift, dus dit hoort bij de meting bewaard te blijven.';
comment on column public.busyness_monthly.days is
  'Aantal dagen waarop de mediaan rust. Drie gemeten dinsdagen zeggen minder dan vijf.';

-- Leespatroon van de rapportage: alles van één zaak voor één maand, en
-- dezelfde maand een jaar eerder.
create index if not exists idx_busyness_monthly_lookup
  on public.busyness_monthly (business_id, month);

-- RLS aan zonder policies: net als busyness_snapshots is dit afgeleide
-- meetdata die alleen de service-role schrijft én leest. De rapportage
-- draait op de service-role-client.
alter table public.busyness_monthly enable row level security;
