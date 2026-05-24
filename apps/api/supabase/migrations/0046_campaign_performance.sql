-- 0046_campaign_performance.sql
-- Performance-tracking per campagne: opens / clicks / reach / impressions /
-- reservations_attributed + success-classification. Per filly-brein
-- hoofdstuk 9 (Performance-tracking en leerloop).
--
-- Eén rij per campaign_id (niet per dag-bucket); we updaten cumulatief
-- via webhooks + nightly-jobs. Wanneer een meet-window voltooid is
-- (measurement_complete_at gevuld), berekenen we success_score +
-- classification en kunnen we de campagne meenemen in Filly's leerloop.

create table public.campaign_performance (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- ============================================================
  -- Mail-metrics (Resend webhooks: delivered/opened/clicked/bounced)
  -- ============================================================
  mail_delivered  integer,
  mail_opened     integer,
  mail_clicked    integer,
  mail_bounced    integer,
  mail_unsubscribed integer,

  -- ============================================================
  -- Social-metrics (Meta Graph API / TikTok Insights; nullable
  -- zolang OAuth-koppelingen niet live zijn)
  -- ============================================================
  social_reach        integer,
  social_impressions  integer,
  social_engagement   integer,  -- likes + comments + shares
  social_saves        integer,  -- IG-specifiek
  social_video_views  integer,  -- Reels/TikTok-specifiek
  social_watch_time_seconds integer,

  -- ============================================================
  -- WhatsApp-metrics (Twilio/Sinch webhooks)
  -- ============================================================
  whatsapp_delivered integer,
  whatsapp_read      integer,
  whatsapp_clicked   integer,

  -- ============================================================
  -- Google Business-metrics (GBP Performance API)
  -- ============================================================
  gbp_impressions integer,
  gbp_clicks      integer,
  gbp_calls       integer,
  gbp_directions  integer,  -- route-clicks

  -- ============================================================
  -- Conversie-attributie (last-touch, uit reservations.via_campaign_id)
  -- ============================================================
  reservations_attributed integer not null default 0,
  guests_attributed       integer not null default 0,
  -- Geschatte revenue in centen op basis van party_size × avg_check.
  revenue_attributed_cents bigint not null default 0,

  -- ============================================================
  -- Lifecycle van de meet-window
  -- ============================================================
  -- Wanneer wordt deze rij compleet beschouwd voor leer-doeleinden?
  -- Per kanaal verschilt het (mail 7d, IG-feed 14d, Reels 30d).
  -- HealthService-achtige nightly-job zet deze.
  measurement_complete_at timestamptz,

  -- Berekend door dezelfde nightly-job zodra measurement_complete_at
  -- gezet wordt. 0-100; null = nog niet berekend.
  success_score smallint check (success_score is null or success_score between 0 and 100),

  -- Categorisering op basis van success_score + filly-brein hfst 9.4.
  classification text check (
    classification is null or classification in (
      'winner', 'average', 'underperformer', 'no_data'
    )
  ),

  -- Confounding-factoren die de score-classificatie hebben beïnvloed.
  -- jsonb met sleutels zoals {"weather": "rain", "holiday": "moederdag"}.
  confounding_factors jsonb,

  -- ============================================================
  -- Outlier-flag (filly-brein hfst 9.7)
  -- ============================================================
  -- Eigenaar kan markeren "viel buiten controle" met reden ("rain",
  -- "staking", "fooddelivery_strike"). Excludeert deze campagne dan
  -- uit Filly's leerloop, maar laat de cijfers wél zien in UI.
  marked_outlier         boolean not null default false,
  marked_outlier_reason  text,
  marked_outlier_at      timestamptz,
  marked_outlier_by_user uuid references public.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaign_performance_restaurant on public.campaign_performance(restaurant_id, measurement_complete_at desc);
create index idx_campaign_performance_classification on public.campaign_performance(restaurant_id, classification) where classification is not null;
create index idx_campaign_performance_outliers on public.campaign_performance(restaurant_id, marked_outlier) where marked_outlier = true;

-- Auto-update updated_at zodat de UI weet wanneer cijfers verfrist zijn.
create or replace function public.touch_campaign_performance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_campaign_performance_updated_at
  before update on public.campaign_performance
  for each row
  execute function public.touch_campaign_performance_updated_at();

alter table public.campaign_performance enable row level security;
create policy "campaign_performance_access" on public.campaign_performance
  for all using (public.user_has_restaurant_access(restaurant_id));
