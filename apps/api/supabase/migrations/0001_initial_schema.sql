-- ============================================================
-- Get Filly — Initial schema (v1 + v2 hooks)
-- ============================================================
-- Dit is de volledige database-opbouw. Alle v1-features zitten
-- in functionele kolommen; v2-features als kolommen/tabellen die
-- leeg mogen blijven tot we ze gaan gebruiken.
--
-- Hoe uitvoeren:
--   1. Open Supabase → SQL Editor
--   2. Plak dit hele bestand
--   3. Klik Run
-- ============================================================

-- Drop oude test-tabel (alleen campaigns bestaat nu)
drop table if exists public.campaigns cascade;

-- ============================================================
-- 1. RESTAURANTS
-- ============================================================
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  type text, -- bistro, brasserie, fine_dining, trattoria, café, etc.
  cuisine_style text[], -- ['french','italian','dutch','fusion']
  description text,
  -- Locatie
  address text,
  city text,
  postal_code text,
  country text default 'NL',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  -- Eigenschappen
  price_range smallint check (price_range between 1 and 4), -- 1=€, 4=€€€€
  capacity_seats integer,
  capacity_terrace integer,
  has_terrace boolean default false,
  has_private_room boolean default false,
  has_kids_menu boolean default false,
  -- Tijden (jsonb zodat per dag vrij invulbaar)
  opening_hours jsonb, -- { "mon": {"open":"11:00","close":"23:00"}, ... }
  kitchen_closing_time jsonb,
  closed_dates date[] default '{}',
  -- Branding
  brand_tone text check (brand_tone in ('casual', 'professional', 'playful')) default 'casual',
  brand_colors jsonb,
  logo_url text,
  signature_dishes text[],
  languages_spoken text[] default '{nl}',
  -- Socials + web
  social_media jsonb, -- { "instagram":"@restaurant", "facebook":"...", "tiktok":"..." }
  website_url text,
  -- Abonnement
  plan text check (plan in ('starter', 'pro', 'enterprise')) default 'starter',
  -- Meta
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 2. USERS (profiel-extensie bovenop Supabase Auth)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  notification_prefs jsonb default '{"email": true, "in_app": true, "push": false}'::jsonb,
  two_factor_enabled boolean default false, -- v2
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 3. RESTAURANT_USERS (many-to-many met rollen)
-- ============================================================
create table public.restaurant_users (
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text check (role in ('owner', 'manager', 'staff')) default 'owner',
  created_at timestamptz default now(),
  primary key (restaurant_id, user_id)
);

-- ============================================================
-- 4. GUESTS
-- ============================================================
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  birthday date,
  source text, -- 'zenchef','opentable','walk_in','manual','csv_import'
  tags text[] default '{}',
  preferences jsonb default '{}'::jsonb, -- dietary, allergies, favorite_table, etc.
  visit_count integer default 0,
  first_visit_at date,
  last_visit_at date,
  no_show_count integer default 0,
  average_spend_cents integer,
  lifetime_value_cents integer, -- v2: AI-computed
  churn_risk_score numeric(3, 2), -- v2: 0.00-1.00
  mail_opt_in boolean default false,
  sms_opt_in boolean default false,
  whatsapp_opt_in boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz -- soft delete voor GDPR
);
create index idx_guests_restaurant on public.guests(restaurant_id) where deleted_at is null;
create index idx_guests_email on public.guests(restaurant_id, email) where deleted_at is null;

-- ============================================================
-- 5. GUEST_VISITS (per-bezoek historie)
-- ============================================================
create table public.guest_visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  visit_date date not null,
  party_size integer default 1,
  estimated_spend_cents integer,
  actual_spend_cents integer, -- uit POS
  table_code text,
  source text check (source in ('reservation', 'walk_in')) default 'reservation',
  is_no_show boolean default false,
  notes text,
  created_at timestamptz default now()
);
create index idx_guest_visits_restaurant_date on public.guest_visits(restaurant_id, visit_date);
create index idx_guest_visits_guest on public.guest_visits(guest_id);

-- ============================================================
-- 6. OCCUPANCY_DAYS (dagelijkse bezetting)
-- ============================================================
create table public.occupancy_days (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  date date not null,
  reservations_count integer default 0,
  estimated_guests integer default 0,
  actual_guests integer,
  occupancy_pct numeric(5, 2),
  estimated_revenue_cents integer,
  actual_revenue_cents integer,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(restaurant_id, date)
);
create index idx_occupancy_days_restaurant_date on public.occupancy_days(restaurant_id, date);

-- ============================================================
-- 7. MENU_ITEMS (voor AI-context bij campagnes)
-- ============================================================
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  category text, -- voorgerecht, hoofd, dessert, drank, etc.
  price_cents integer,
  is_signature boolean default false,
  is_seasonal boolean default false,
  season text check (season in ('spring', 'summer', 'autumn', 'winter')),
  is_available boolean default true,
  dietary_tags text[] default '{}', -- vegan, vegetarian, gluten_free, etc.
  photo_url text,
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_menu_items_restaurant on public.menu_items(restaurant_id) where is_available = true;

-- ============================================================
-- 8. SEGMENTS (doelgroepen voor campagnes)
-- ============================================================
create table public.segments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  criteria jsonb, -- complex filter rules, bv. { "visit_count_min": 3, "last_visit_days_max": 90 }
  guest_count_cached integer default 0,
  is_system boolean default false, -- true voor ingebouwde: Vaste gasten, VIPs, Inactief
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_segments_restaurant on public.segments(restaurant_id);

-- ============================================================
-- 9. CAMPAIGN_TEMPLATES (herbruikbare sjablonen)
-- ============================================================
create table public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade, -- null = platform-default
  name text not null,
  type text check (type in ('mail', 'social', 'whatsapp')) not null,
  subject_line text, -- voor mail
  body text not null,
  tags text[] default '{}',
  usage_count integer default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 10. AI_SUGGESTIONS (Filly-voorstellen)
-- ============================================================
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  trigger_type text not null, -- 'low_occupancy','weather','seasonal','birthday','retention'
  trigger_context jsonb, -- bv. { "target_date": "2026-04-24", "current_occupancy_pct": 38, "weather": "rain" }
  suggested_campaign jsonb not null, -- volledig voorstel: name, type, subject, body, segment
  status text check (status in ('pending', 'approved', 'rejected', 'expired')) default 'pending',
  rejection_reason text, -- door gebruiker gegeven feedback (voor AI-learning)
  approved_campaign_id uuid, -- FK wordt later gezet nadat campagne is aangemaakt
  expires_at timestamptz, -- suggesties verlopen als actie-datum voorbij is
  created_at timestamptz default now(),
  acted_at timestamptz
);
create index idx_ai_suggestions_restaurant_status on public.ai_suggestions(restaurant_id, status);

-- ============================================================
-- 11. CAMPAIGNS (header — kanaal-onafhankelijk)
-- ============================================================
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  type text check (type in ('mail', 'social', 'whatsapp')) not null,
  status text check (status in ('concept', 'ingepland', 'actief', 'afgerond', 'gearchiveerd')) default 'concept',
  meta text, -- kort display-label, bv. "17 apr · 248 gasten"
  -- Doelgroep
  target_segment_id uuid references public.segments(id) on delete set null,
  -- Planning
  scheduled_for timestamptz,
  executed_at timestamptz,
  -- Metadata
  tags text[] default '{}',
  budget_cents integer, -- v2: voor betaalde ads
  ab_variant jsonb, -- v2: { "a": {...}, "b": {...} }
  ai_suggestion_id uuid references public.ai_suggestions(id) on delete set null,
  result_stats jsonb default '{}'::jsonb, -- generieke teller { extra_reservations, revenue_impact }
  unsubscribe_token text, -- unieke string voor unsubscribe-links (alleen mail)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_campaigns_restaurant_status on public.campaigns(restaurant_id, status);
create index idx_campaigns_scheduled on public.campaigns(restaurant_id, scheduled_for) where status in ('ingepland', 'actief');

-- ============================================================
-- 11a. CAMPAIGN_MAIL_CONTENT
-- ============================================================
create table public.campaign_mail_content (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  subject_line text not null,
  preheader text, -- preview-regel in inbox
  body_html text,
  body_plain text,
  from_name text,
  reply_to text,
  -- Verzend-statistieken specifiek voor mail
  stats jsonb default '{}'::jsonb, -- { sent, opened, clicked, bounced, unsubscribed }
  updated_at timestamptz default now()
);

-- ============================================================
-- 11b. CAMPAIGN_SOCIAL_CONTENT
-- ============================================================
create table public.campaign_social_content (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  caption text not null,
  hashtags text[] default '{}',
  media_urls text[] default '{}', -- afbeeldingen/video's voor de post
  platforms text[] default '{}', -- ['instagram','facebook','tiktok','linkedin']
  cta_link text, -- "meer info"-link bij post
  -- Statistieken specifiek voor social
  stats jsonb default '{}'::jsonb, -- { impressions, likes, comments, shares, reach }
  updated_at timestamptz default now()
);

-- ============================================================
-- 11c. CAMPAIGN_WHATSAPP_CONTENT
-- ============================================================
create table public.campaign_whatsapp_content (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  message_text text not null,
  media_url text, -- optioneel: afbeelding/video mee sturen
  template_name text, -- WhatsApp Business vereist vooraf goedgekeurde templates
  template_params jsonb, -- variabelen voor template placeholders
  -- Statistieken specifiek voor whatsapp
  stats jsonb default '{}'::jsonb, -- { sent, delivered, read, replied }
  updated_at timestamptz default now()
);

-- Terug-koppeling ai_suggestions → campaigns
alter table public.ai_suggestions
  add constraint fk_approved_campaign
  foreign key (approved_campaign_id)
  references public.campaigns(id) on delete set null;

-- ============================================================
-- 12. CAMPAIGN_RECIPIENTS (who-got-what)
-- ============================================================
create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  email_at_send text, -- snapshot op moment van versturen
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  bounce_type text check (bounce_type in ('soft', 'hard'))
);
create index idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id);
create index idx_campaign_recipients_guest on public.campaign_recipients(guest_id);

-- ============================================================
-- 13. CHAT_CONVERSATIONS
-- ============================================================
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text, -- auto-samengevat door AI
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 14. CHAT_MESSAGES
-- ============================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role text check (role in ('filly', 'user', 'system')) not null,
  content text,
  message_card jsonb, -- bij AI-voorstel inline getoond (titel, body, actieknoppen)
  ai_suggestion_id uuid references public.ai_suggestions(id) on delete set null,
  tokens_in integer, -- voor kostenmeting
  tokens_out integer,
  created_at timestamptz default now()
);
create index idx_chat_messages_conversation on public.chat_messages(conversation_id, created_at);

-- ============================================================
-- 15. NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  type text not null, -- 'ai_suggestion','campaign_result','low_occupancy','review_alert'
  title text not null,
  body text,
  link text, -- interne url, bv. /dashboard/suggesties/abc-123
  read_at timestamptz,
  created_at timestamptz default now()
);
create index idx_notifications_user_unread on public.notifications(user_id, created_at desc) where read_at is null;

-- ============================================================
-- 16. INTEGRATIONS
-- ============================================================
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null, -- 'openweather','sendgrid','meta_facebook','meta_instagram','google_business','whatsapp','zenchef','opentable','sevenrooms','resengo','lightspeed','easyorder','tripadvisor','thefork'
  status text check (status in ('connected', 'disconnected', 'error')) default 'disconnected',
  credentials jsonb, -- OBSCURE/ENCRYPT in productie; voor MVP kan het zo
  settings jsonb default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(restaurant_id, provider)
);

-- ============================================================
-- 17. REVIEWS (v2: Google/TripAdvisor scraping)
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source text check (source in ('google', 'tripadvisor', 'thefork', 'iens')) not null,
  rating smallint check (rating between 1 and 5),
  title text,
  body text,
  author text,
  review_date date,
  response_text text,
  responded_at timestamptz,
  external_id text,
  created_at timestamptz default now(),
  unique(source, external_id)
);
create index idx_reviews_restaurant on public.reviews(restaurant_id, review_date desc);

-- ============================================================
-- 18. AUDIT_LOG
-- ============================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action text not null, -- 'campaign_approved','campaign_rejected','guest_added','integration_connected', etc.
  entity_type text, -- 'campaign','guest','ai_suggestion'
  entity_id uuid,
  payload jsonb, -- voor diff / context
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);
create index idx_audit_log_restaurant on public.audit_log(restaurant_id, created_at desc);

-- ============================================================
-- 19. FILLY_MEMORY (AI-geheugen: voorkeuren, context tussen sessies)
-- ============================================================
create table public.filly_memory (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  key text not null, -- 'tone_preference','no_emoji','signature_phrase'
  value text,
  confidence numeric(3, 2) default 1.0, -- 0.00-1.00
  last_reinforced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(restaurant_id, key)
);

-- ============================================================
-- 20. FILLY_GOALS (v2: jaardoelen voor AI)
-- ============================================================
create table public.filly_goals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  description text not null,
  metric text, -- 'occupancy_pct','revenue','guest_count','campaign_response_rate'
  target_value numeric,
  target_date date,
  progress_cached numeric(5, 2),
  status text check (status in ('active', 'achieved', 'abandoned')) default 'active',
  created_at timestamptz default now()
);

-- ============================================================
-- 21. FILLY_CONFIG (AI-instellingen per restaurant)
-- ============================================================
create table public.filly_config (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  tone_dial text check (tone_dial in ('conservative', 'active', 'aggressive')) default 'conservative',
  auto_approve_budget_cents integer default 0, -- 0 = alles ter goedkeuring
  allowed_channels text[] default '{}', -- subset van ['mail','social','whatsapp'] die Filly zelfstandig mag versturen
  grounding_rules text, -- vrije tekst met huisregels voor Filly
  updated_at timestamptz default now()
);

-- ============================================================
-- 22. WEATHER_DATA (cache van externe weer-API)
-- ============================================================
create table public.weather_data (
  id uuid primary key default gen_random_uuid(),
  location_key text not null, -- "lat_rounded,lng_rounded"
  date date not null,
  temp_min numeric,
  temp_max numeric,
  weather_code integer, -- WMO code
  description text,
  precipitation_mm numeric,
  fetched_at timestamptz default now(),
  unique(location_key, date)
);
create index idx_weather_location_date on public.weather_data(location_key, date);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Op alle restaurant-scoped tabellen. Policies checken dat de user
-- lid is van het betreffende restaurant via restaurant_users.

alter table public.restaurants enable row level security;
alter table public.users enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.guests enable row level security;
alter table public.guest_visits enable row level security;
alter table public.occupancy_days enable row level security;
alter table public.menu_items enable row level security;
alter table public.segments enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_mail_content enable row level security;
alter table public.campaign_social_content enable row level security;
alter table public.campaign_whatsapp_content enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.integrations enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_log enable row level security;
alter table public.filly_memory enable row level security;
alter table public.filly_goals enable row level security;
alter table public.filly_config enable row level security;
alter table public.weather_data enable row level security;

-- Helper: user heeft toegang tot restaurant_id
create or replace function public.user_has_restaurant_access(rid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from public.restaurant_users
    where restaurant_id = rid and user_id = auth.uid()
  );
$$;

-- Policies: lezen + schrijven alleen als je toegang hebt tot het restaurant.
-- (Service_role bypasst dit automatisch — backend kan alles.)

create policy "restaurants_access" on public.restaurants
  for all using (public.user_has_restaurant_access(id));

create policy "users_self" on public.users
  for all using (id = auth.uid());

create policy "restaurant_users_access" on public.restaurant_users
  for all using (user_id = auth.uid() or public.user_has_restaurant_access(restaurant_id));

-- Voor de rest: eenvoudige pattern
do $$
declare
  t text;
  scoped_tables text[] := array[
    'guests','guest_visits','occupancy_days','menu_items','segments',
    'campaign_templates','ai_suggestions','campaigns',
    'chat_conversations','chat_messages','notifications','integrations',
    'reviews','audit_log','filly_memory','filly_goals','filly_config'
  ];
begin
  foreach t in array scoped_tables loop
    execute format('create policy "%I_access" on public.%I for all using (public.user_has_restaurant_access(restaurant_id));', t, t);
  end loop;
end$$;

-- Campaign content-sub-tabellen + recipients: scope via campaign.restaurant_id
create policy "campaign_mail_content_access" on public.campaign_mail_content
  for all using (
    exists(select 1 from public.campaigns c
           where c.id = campaign_mail_content.campaign_id
             and public.user_has_restaurant_access(c.restaurant_id))
  );
create policy "campaign_social_content_access" on public.campaign_social_content
  for all using (
    exists(select 1 from public.campaigns c
           where c.id = campaign_social_content.campaign_id
             and public.user_has_restaurant_access(c.restaurant_id))
  );
create policy "campaign_whatsapp_content_access" on public.campaign_whatsapp_content
  for all using (
    exists(select 1 from public.campaigns c
           where c.id = campaign_whatsapp_content.campaign_id
             and public.user_has_restaurant_access(c.restaurant_id))
  );
create policy "campaign_recipients_access" on public.campaign_recipients
  for all using (
    exists(select 1 from public.campaigns c
           where c.id = campaign_recipients.campaign_id
             and public.user_has_restaurant_access(c.restaurant_id))
  );

-- weather_data: lezen mag iedereen (cache), schrijven alleen service_role
create policy "weather_data_read" on public.weather_data
  for select using (true);

-- ============================================================
-- SEED DATA — Bistro Get-Filly
-- ============================================================
-- Eén demo-restaurant met voorbeelddata zodat het dashboard
-- meteen iets zinnigs laat zien.

insert into public.restaurants (
  id, name, slug, type, cuisine_style, description,
  address, city, postal_code, country, latitude, longitude,
  price_range, capacity_seats, capacity_terrace,
  has_terrace, has_private_room, has_kids_menu,
  opening_hours, closed_dates,
  brand_tone, signature_dishes,
  social_media, website_url, plan
) values (
  '00000000-0000-0000-0000-000000000001',
  'Bistro Get-Filly',
  'bistro-get-filly',
  'bistro',
  array['french','dutch'],
  'Gezellige buurtbistro met focus op seizoensgerechten en lokale leveranciers.',
  'Prinsengracht 123', 'Amsterdam', '1015 AB', 'NL',
  52.3676, 4.9041,
  2, 48, 16,
  true, true, false,
  '{"mon":{"open":"17:00","close":"23:00"},"tue":{"open":"17:00","close":"23:00"},"wed":{"open":"17:00","close":"23:00"},"thu":{"open":"12:00","close":"23:00"},"fri":{"open":"12:00","close":"00:00"},"sat":{"open":"10:00","close":"00:00"},"sun":{"open":"10:00","close":"22:00"}}'::jsonb,
  '{}'::date[],
  'casual',
  array['Kalfsstoof met pommes purée','Zeebaars met lenteuitjes','Crème brûlée'],
  '{"instagram":"@bistrogetfilly","facebook":"bistrogetfilly"}'::jsonb,
  'https://bistrogetfilly.example.nl',
  'pro'
);

-- Menu items (klein voorbeeld)
insert into public.menu_items (restaurant_id, name, description, category, price_cents, is_signature, is_seasonal, season, dietary_tags) values
  ('00000000-0000-0000-0000-000000000001', 'Burrata met geroosterde asperges', 'Italiaanse burrata, groene asperges, citroen-olijfolie', 'voorgerecht', 1250, false, true, 'spring', array['vegetarian']),
  ('00000000-0000-0000-0000-000000000001', 'Kalfsstoof', 'Klassieke kalfsstoof met pommes purée en stoofgroente', 'hoofd', 2450, true, false, null, array[]::text[]),
  ('00000000-0000-0000-0000-000000000001', 'Zeebaars met lenteuitjes', 'Hele zeebaars uit de oven, seizoensgroente, beurre blanc', 'hoofd', 2850, true, true, 'spring', array['gluten_free']),
  ('00000000-0000-0000-0000-000000000001', 'Crème brûlée', 'Klassiek toetje met gekarameliseerde suikerkorst', 'dessert', 950, true, false, null, array['vegetarian']);

-- Gasten (klein sample)
insert into public.guests (restaurant_id, first_name, last_name, email, phone, birthday, source, tags, visit_count, last_visit_at, mail_opt_in) values
  ('00000000-0000-0000-0000-000000000001', 'Sophie', 'de Vries', 'sophie.devries@example.nl', '+31612345678', '1985-06-12', 'manual', array['vaste_gast','vip'], 24, '2026-04-12', true),
  ('00000000-0000-0000-0000-000000000001', 'Marco', 'Rossi', 'marco.rossi@example.it', '+31687654321', '1978-11-03', 'zenchef', array['vaste_gast','wijnliefhebber'], 18, '2026-04-08', true),
  ('00000000-0000-0000-0000-000000000001', 'Lisa', 'van den Berg', 'lisa.vdberg@example.nl', '+31698765432', '1992-03-25', 'manual', array['nieuw'], 3, '2026-03-28', true),
  ('00000000-0000-0000-0000-000000000001', 'Tom', 'Jansen', 'tom.jansen@example.nl', '+31611223344', '1980-09-17', 'opentable', array['inactief'], 7, '2025-11-02', false);

-- Occupancy april 2026 (sample: dagen 14-20)
insert into public.occupancy_days (restaurant_id, date, reservations_count, estimated_guests, occupancy_pct, estimated_revenue_cents) values
  ('00000000-0000-0000-0000-000000000001', '2026-04-14', 12, 28, 58, 168000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-15', 14, 32, 67, 192000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-16', 8, 18, 38, 108000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-17', 18, 41, 85, 246000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-18', 20, 46, 95, 276000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-19', 17, 39, 82, 234000),
  ('00000000-0000-0000-0000-000000000001', '2026-04-20', 13, 30, 62, 180000);

-- Campagnes — header + sub-tabel per kanaal
-- Gebruik expliciete UUIDs zodat we de sub-tabellen kunnen koppelen
insert into public.campaigns (id, restaurant_id, name, type, status, meta, tags, result_stats) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Chef''s Lunch — donderdag', 'mail', 'actief', '17 apr · 248 gasten', array['lunch','weekdeal'], '{"extra_reservations":12}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Paasbrunch post', 'social', 'ingepland', 'Instagram · 20 apr', array['pasen','instagram'], '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Voorjaarsmenu aankondiging', 'mail', 'concept', '25 apr · 1.120 gasten', array['seizoen','menu'], '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Terras-opening story', 'social', 'afgerond', 'Instagram · 15 apr', array['terras'], '{"extra_reservations":4}'::jsonb);

-- Mail content (voor campagne 101 en 103)
insert into public.campaign_mail_content (campaign_id, subject_line, preheader, body_html, body_plain, from_name, reply_to, stats) values
  ('00000000-0000-0000-0000-000000000101',
   '3-gangen Chef''s Lunch voor €24,50',
   'Donderdag bij Bistro Get-Filly — een warm welkom met 3 gangen',
   '<p>Beste gast,</p><p>Deze donderdag serveren we onze Chef''s Lunch: 3 gangen voor €24,50.</p><p>Tot dan!</p>',
   'Beste gast, deze donderdag serveren we onze Chef''s Lunch — 3 gangen voor €24,50. Tot dan!',
   'Bistro Get-Filly', 'info@bistrogetfilly.example.nl',
   '{"sent":248,"opened":104,"clicked":38,"bounced":2,"unsubscribed":1}'::jsonb),
  ('00000000-0000-0000-0000-000000000103',
   'Ons voorjaarsmenu staat klaar',
   'Asperges, radijzen, rabarber — kom proeven',
   '<p>De asperges zijn binnen, de radijzen en rabarber ook.</p><p>Ons nieuwe voorjaarsmenu is vanaf vrijdag te proeven.</p>',
   'De asperges zijn binnen, de radijzen en rabarber ook. Ons nieuwe voorjaarsmenu is vanaf vrijdag te proeven.',
   'Bistro Get-Filly', 'info@bistrogetfilly.example.nl',
   '{}'::jsonb);

-- Social content (voor campagne 102 en 104)
insert into public.campaign_social_content (campaign_id, caption, hashtags, media_urls, platforms, stats) values
  ('00000000-0000-0000-0000-000000000102',
   'Pasen bij Bistro Get-Filly — brunch met bubbels en lam van eigen grill. Tag iemand die erbij wil! 🌷',
   array['pasen','brunch','amsterdam','bistro'],
   array[]::text[],
   array['instagram','facebook'],
   '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104',
   'Het terras is weer open! ☀️',
   array['terras','lente','amsterdam'],
   array[]::text[],
   array['instagram'],
   '{"impressions":1820,"likes":142,"comments":18,"shares":7}'::jsonb);

-- AI-suggesties (3 wachtend op goedkeuring)
insert into public.ai_suggestions (restaurant_id, trigger_type, trigger_context, suggested_campaign, status) values
  ('00000000-0000-0000-0000-000000000001', 'low_occupancy',
   '{"target_date":"2026-04-23","current_occupancy_pct":42,"weather":"rain"}'::jsonb,
   '{"name":"Donderdag comfort food","type":"mail","subject":"Warme stoofschotel op donderdag","segment":"vaste_gast"}'::jsonb,
   'pending'),
  ('00000000-0000-0000-0000-000000000001', 'seasonal',
   '{"upcoming_event":"Koningsdag","date":"2026-04-27"}'::jsonb,
   '{"name":"Koningsdag brunch","type":"social","caption":"Oranje bitterballen bij Bistro Get-Filly 🧡"}'::jsonb,
   'pending'),
  ('00000000-0000-0000-0000-000000000001', 'retention',
   '{"segment":"inactief","guest_count":23}'::jsonb,
   '{"name":"We missen je — 10% korting","type":"mail","subject":"Kom terug naar Bistro Get-Filly","segment":"inactief"}'::jsonb,
   'pending');

-- Chat conversatie + berichten
insert into public.chat_conversations (id, restaurant_id, title) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Donderdag campagne');

insert into public.chat_messages (conversation_id, restaurant_id, role, content, message_card) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'filly',
   'Goedemorgen! Ik zie dat donderdag op 38% staat en er regen verwacht wordt. Wil je dat ik een campagne opstel?',
   '{"title":"📩 Chef''s Lunch — do 17 apr","body":"3-gangen voor €24,50 · Mail naar 248 gasten · Verwachting: +22% bezetting"}'::jsonb),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'user',
   'Ziet er goed uit. Verstuur maar!', null),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'filly',
   'Klaar! Mail gaat naar 248 gasten. Ik hou de open-rate bij.', null);

-- Filly config
insert into public.filly_config (restaurant_id, tone_dial, auto_approve_budget_cents, allowed_channels) values
  ('00000000-0000-0000-0000-000000000001', 'conservative', 0, array[]::text[]);

-- Standaard segmenten
insert into public.segments (restaurant_id, name, description, criteria, is_system) values
  ('00000000-0000-0000-0000-000000000001', 'Vaste gasten', '3+ bezoeken', '{"visit_count_min":3}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000001', 'VIPs', 'Meest waardevol', '{"lifetime_value_cents_min":100000}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000001', 'Inactieve gasten', '90+ dagen niet geweest', '{"last_visit_days_min":90}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000001', 'Mail-opt-ins', 'Marketing toestemming', '{"mail_opt_in":true}'::jsonb, true);
