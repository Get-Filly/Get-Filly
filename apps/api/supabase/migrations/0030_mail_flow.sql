-- ============================================================
-- 0030 — Mail-flow: campaign_sends + unsubscribe + mail-velden
-- ============================================================
-- Drie wijzigingen voor de mail-feature:
--
-- 1. campaign_sends — history per recipient. Geeft ons:
--    - "Heeft deze gast deze campagne al gehad?"-deduplicatie
--    - Bounce/open/click-tracking via Resend webhooks
--    - AVG audit-trail (wie, wanneer, naar wie)
--
-- 2. unsubscribe_tokens — unieke onraadbare tokens per (gast,restaurant)
--    voor de one-click-unsubscribe-link in elke mail. Zonder login
--    bereikbaar via /u/<token>-route. GDPR-verplicht.
--
-- 3. restaurants.mail_* — voor stap 2 (eigen domein per klant). Default
--    null = mail wordt verzonden vanuit social@get-filly.com met
--    restaurant.name als From-naam. Geverifieerd eigen domein → mail
--    komt van mail_from_address direct.
-- ============================================================

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  recipient_email text not null,

  -- Resend's eigen message-id zodat we events uit hun webhook (delivered,
  -- bounced, opened, clicked) aan de juiste rij kunnen koppelen.
  resend_message_id text,

  status text not null check (status in (
    'queued',     -- in DB, nog niet naar Resend gestuurd
    'sent',       -- Resend heeft 'm geaccepteerd
    'delivered',  -- Aangekomen bij ontvanger (webhook event)
    'bounced',    -- Geweigerd door ontvanger (hard bounce / soft bounce)
    'complained', -- Spam-rapportage door ontvanger
    'opened',     -- Geopend (alleen bij tracking aan)
    'clicked',    -- Link aangeklikt
    'failed'      -- Lokaal mislukt vóór de Resend-call
  )) default 'queued',

  -- Vrije tekst-uitleg bij bounces / failures voor support en debugging.
  status_detail text,

  sent_at timestamptz default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz
);
create index if not exists idx_campaign_sends_campaign
  on public.campaign_sends(campaign_id);
create index if not exists idx_campaign_sends_recipient
  on public.campaign_sends(recipient_email);
create index if not exists idx_campaign_sends_resend_id
  on public.campaign_sends(resend_message_id) where resend_message_id is not null;

-- Onsubscribe-tokens: cryptografisch random, niet raadbaar. We slaan de
-- email apart op zodat een token nog werkt nadat een gast is verwijderd
-- uit guests (right-to-be-forgotten zonder de unsubscribe te breken).
create table if not exists public.unsubscribe_tokens (
  token text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,
  email text not null,
  used_at timestamptz,                       -- wanneer geklikt
  created_at timestamptz default now()
);
create index if not exists idx_unsubscribe_tokens_email
  on public.unsubscribe_tokens(email);

-- Mail-velden op restaurants. Default null betekent: mail gaat vanuit
-- social@get-filly.com (stap 1, default-flow). Pas wanneer een eigenaar
-- via account-pagina z'n eigen domein verifieert wordt mail_domain_status
-- 'verified' en gebruikt de send-flow mail_from_address.
alter table public.restaurants
  add column if not exists mail_domain text,
  add column if not exists mail_from_address text,
  add column if not exists mail_domain_status text check (
    mail_domain_status in ('pending','verified','failed')
  ),
  add column if not exists mail_resend_domain_id text,
  add column if not exists mail_domain_verified_at timestamptz;

comment on column public.restaurants.mail_from_address is
  'From-adres voor uitgaande campagne-mails. Gebruikt alleen als mail_domain_status=verified; anders fallback social@get-filly.com.';

-- RLS — beide tabellen via team-toegang van het restaurant.
alter table public.campaign_sends enable row level security;
alter table public.unsubscribe_tokens enable row level security;

drop policy if exists "campaign_sends_access" on public.campaign_sends;
create policy "campaign_sends_access" on public.campaign_sends
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_sends.campaign_id
        and public.user_has_restaurant_access(c.restaurant_id)
    )
  );

drop policy if exists "unsubscribe_tokens_access" on public.unsubscribe_tokens;
create policy "unsubscribe_tokens_access" on public.unsubscribe_tokens
  for all using (public.user_has_restaurant_access(restaurant_id));
