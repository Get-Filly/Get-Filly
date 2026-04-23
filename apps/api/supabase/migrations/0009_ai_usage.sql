-- ============================================================
-- Get Filly — Migratie 0009
-- ai_usage-tabel: elke Claude-call loggen voor kosten + limieten
-- ============================================================
-- Doel:
--   1. Kosten-inzicht per restaurant (wat kost één klant ons?)
--   2. Rate-limiting: "hoeveel calls deze klant in het laatste uur?"
--   3. Abuse-detectie: uitschieters identificeren
--   4. Straks: usage-dashboard voor klant zelf ("127/500 gebruikt")
--
-- Design-beslissingen:
--   - We slaan ALLEEN tokens op, geen kosten. Anthropic-prijzen
--     wijzigen; we berekenen kosten on-the-fly in code met actuele
--     tarieven. Zo is historische data altijd correct her-te-rekenen.
--   - feature is text (niet enum) zodat nieuwe Filly-features geen
--     migratie vereisen. Enum was netter gewest maar we kiezen voor
--     lage toevoegings-frictie.
--   - Geen response_id van Anthropic — we hebben 'm nooit nodig voor
--     onze features, en bespaart opslag.
--   - Index op (restaurant_id, created_at desc) is cruciaal: dat is
--     exact de query-vorm voor rate-limiting ("laatste uur per tenant").
-- ============================================================

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- User-id mag null zijn als een call door een scheduled-job wordt
  -- getriggerd (later: auto-suggesties die elke ochtend draaien).
  user_id uuid references public.users(id) on delete set null,
  -- Welke Filly-feature triggerde de call. Vrije text, conventie:
  -- snake_case en liefst kort. Voorbeelden: 'review_reply',
  -- 'chat', 'suggestion', 'menu_vision'.
  feature text not null,
  -- Exacte model-id zoals Anthropic 'm noemt. Zo kunnen we later
  -- model-migraties ("alle Sonnet-4.6 calls kostten X") analyseren.
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  -- cached_input_tokens = gedeelte van input dat via prompt-caching
  -- ging (90% goedkoper). null tot we caching activeren.
  cached_input_tokens integer check (cached_input_tokens >= 0),
  created_at timestamptz not null default now()
);

-- Rate-limit-query draait altijd als:
--   select count(*) from ai_usage
--   where restaurant_id = $1 and created_at > now() - interval '1 hour'
-- Dit index is daar op gebouwd.
create index if not exists ai_usage_restaurant_time_idx
  on public.ai_usage(restaurant_id, created_at desc);

-- Voor analytics per feature (bv. "welke feature trekt het meest").
create index if not exists ai_usage_feature_time_idx
  on public.ai_usage(feature, created_at desc);

-- RLS aan, backend gebruikt service_role — geen policies voor
-- gewone users nodig. Later, als we een usage-dashboard voor de klant
-- bouwen, voegen we een select-policy toe die de user zijn eigen
-- restaurant laat zien.
alter table public.ai_usage enable row level security;

comment on table public.ai_usage is
  'Log van alle Claude-calls. Driver voor kosten-analyse, rate-limiting en abuse-detectie.';
