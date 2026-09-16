# Get Filly — Database-schema

Overzicht van alle tabellen, hun rol in het systeem en de belangrijkste
relaties. Bron-of-truth blijven de SQL-migraties in
[`apps/api/supabase/migrations/`](../apps/api/supabase/migrations/).
Deze doc is bijgehouden t/m migratie 0020.

---

## Multi-tenant model

Alle business-data hangt aan een `restaurant_id`. Een gebruiker kan via
`restaurant_users` aan meerdere restaurants gekoppeld zijn (rol: owner /
manager / staff). Backend gebruikt `service_role` en isoleert tenants
in TS-guards (`RestaurantAccessGuard`); RLS staat aan maar wordt
bypassed door de service-key — defense-in-depth via per-request
JWT-clients staat op de roadmap.

---

## Identiteit & accounts

### `users` (extensie van `auth.users`)
- `id` uuid → `auth.users(id)` on delete cascade
- `full_name`, `avatar_url`
- `notification_prefs` jsonb — `{ email, in_app, push }`
- `two_factor_enabled` boolean (UI nog niet)

### `restaurants` (de zaak zelf)
**Basics**: `id`, `name`, `slug`, `type`, `cuisine_style[]`, `description`

**Identiteit (voor Filly's prompts)** — toegevoegd in 0003:
- `tagline`, `target_audience`, `atmosphere`
- `unique_selling_points`, `special_events`, `signature_dishes[]`
- `brand_tone` (`casual` | `professional` | `playful`)

**Locatie**: `address`, `city`, `postal_code`, `country` (default `NL`),
`latitude`, `longitude` (auto-gevuld via PDOK Locatieserver).

**Capaciteit & faciliteiten**: `price_range` (1-4),
`capacity_seats`, `capacity_terrace`, `has_terrace`, `has_private_room`,
`has_kids_menu`, `terrace_sun_periods[]` (0019), `terrace_type` (0020).

**Tijden**: `opening_hours` jsonb (`{ mon: {open,close}, … }`),
`kitchen_closing_time` jsonb, `closed_dates[]`.

**Branding**: `logo_url`, `brand_colors` jsonb, `languages_spoken[]`.

**Web**: `website_url`, `website_summary`, `website_last_analyzed_at`,
`menu_document_url`, `social_media` jsonb.

**Bedrijfsgegevens (voor mailings/AVG/AV)** — toegevoegd in 0018:
- `legal_name`, `kvk_number`, `vat_number`
- `contact_email`, `contact_phone`
- `email_from_name`, `email_reply_to`

**Abonnement**: `plan` (`starter`/`pro`/`enterprise`),
`onboarded_at` (0010).

### `restaurant_users` (n-op-m koppel)
- `(restaurant_id, user_id)` primary key
- `role` (`owner`/`manager`/`staff`)

---

## Gasten + reserveringen

### `guests`
Persoonlijke gegevens van bezoekers.
- `id`, `restaurant_id`, `name`, `email`, `phone`
- `preferences` jsonb (allergies, voorkeuren)
- `lifetime_visits`, `last_visit_at`
- `opt_in_marketing` boolean
- `acquired_via_campaign_id` — **TODO**: FK naar `campaigns(id)`
  ontbreekt nog (zie BACKLOG)

### `guest_visits`
Historisch bezoek-log.
- `restaurant_id`, `guest_id`, `visit_date`, `party_size`
- `source` (`reservation`/`walk_in`), `is_no_show`

### `reservations`
Geplande bezoeken.
- `restaurant_id`, `guest_id`, `guest_name`, `guest_phone`, `guest_email`
- `reservation_date`, `reservation_time`, `party_size`
- `status` (`bevestigd`/`ingecheckt`/`voltooid`/`no_show`/`geannuleerd`)
- `source` (`handmatig` / integratie-naam)
- `via_campaign_id` — **TODO**: FK naar `campaigns(id)` ontbreekt nog

### `occupancy_days`
Pre-aggregeerde bezetting per dag.
- `(restaurant_id, date)` primary key
- `occupancy_pct`, `estimated_guests`, `revenue_cents`

---

## Menu

### `menu_items`
- `id`, `restaurant_id`, `name`, `description`, `category`
- `price_cents`, `is_signature`, `is_seasonal`, `season`,
  `is_available`, `display_order`
- `dietary_tags[]` (vegan, vegetarian, gluten_free)
- `allergens[]` (toegevoegd in 0013, EU-allergeencodes)
- `photo_url`
- `menu_upload_id` → `menu_uploads(id)` (toegevoegd in 0011, on delete
  set null) — koppelt automatisch geïmporteerde items aan hun upload

### `menu_uploads` (0011)
Audit-trail van geüploade menukaarten.
- `restaurant_id`, `file_path` (in `menu-uploads` Storage-bucket)
- `file_name`, `file_size_bytes`, `mime_type`
- `processed_at`, `extracted_items_count`, `processing_error`
- `uploaded_by` → `users(id)`

---

## Campagnes

### `campaigns` (header)
- `id`, `restaurant_id`, `name`, `type` (`mail`/`social`/`whatsapp`)
- `status` — sinds 0017 alleen nog 4 waarden: `concept` / `ingepland`
  / `actief` / `afgerond` (`gearchiveerd` is afgeschaft)
- `target_segment_id` → `segments(id)`
- `scheduled_for`, `executed_at`
- `meta` (kort display-label), `tags[]`, `result_stats` jsonb
- **Filly-cache** (0014): `filly_variants` jsonb,
  `filly_variants_regen_count`
- **Schedule-cache** (0016): `suggested_scheduled_for`,
  `suggested_scheduled_reasoning`

### `campaign_mail_content` / `campaign_social_content` / `campaign_whatsapp_content`
Type-specifieke velden (1-op-1 met campaigns):
- mail: `subject_line`, `body_plain`, `body_html`, `header_image_url`
- social: `caption`, `media_urls[]`, `platforms[]`
- whatsapp: `message_text`, `media_url`, `template_name`

### `campaign_recipients`
- `(campaign_id, guest_id)` koppel + `status`, `sent_at`, `opened_at`

### `campaign_templates`
Hergebruik-templates met placeholder-vars.

### `segments`
Doelgroep-definities (jsonb-criteria).

---

## AI / Filly

### `ai_suggestions`
Door Filly gegenereerde voorstellen — auto-detect of uit chat.
- `trigger_type` (`chat`/`low_occupancy`/`weather`/`seasonal`/
  `birthday`/`retention`)
- `trigger_context` jsonb (waarom dacht Filly dit nu)
- `suggested_campaign` jsonb (volledige draft, incl. variants)
- `expected_impact` jsonb, `confidence_score`, `urgency`
- `reasoning` (Filly's uitleg)
- `status` (`pending`/`approved`/`rejected`),
  `approved_campaign_id` → campaigns

### `chat_conversations` / `chat_messages`
Filly-chat persistentie.
- `chat_messages.message_card` jsonb — gestructureerde acties (bv.
  campagne-voorstel) die de UI als card rendert
- `ai_suggestion_id` koppel — chat-voorstellen die naar suggestion
  worden gepromoveerd

### `ai_usage` (0009 + 0012)
Tracking van élke Claude-call. Forced via `AiCallMeta`-type.
- `restaurant_id` (nullable sinds 0012 voor pre-onboarding)
- `user_id`, `feature`, `model`
- `input_tokens`, `output_tokens`, `cached_input_tokens`
- Sinds prompt-caching live (2026-04-29): `input_tokens` bevat ook
  cache-creation; `cached_input_tokens` toont read-hits

### `filly_memory` / `filly_goals` / `filly_config`
Roadmap-tabellen — nog niet actief gebruikt.

---

## Reviews

### `reviews`
- `source` (`google`/`tripadvisor`/`thefork`/`iens`)
- `rating`, `title`, `body`, `author`, `review_date`
- `response_text`, `responded_at`
- **Filly-cache** (0014): `filly_variants` jsonb,
  `filly_variants_regen_count`

---

## Integraties (toekomstig)

### `integrations`
Per restaurant: welke integraties zijn gekoppeld + tokens. Skeleton
aanwezig sinds 0001; OAuth-flows zijn nog te bouwen (zie BACKLOG P2).

---

## Notificaties + audit

### `notifications`
In-app notifications voor users.

### `audit_log`
**Bestaat sinds 0001 maar wordt nog nergens geschreven** — open punt
voor compliance + debugging (BACKLOG).

---

## Weer

### `weather_data`
Cache van weersvoorspellingen per locatie + dag (Open-Meteo API).
- `(restaurant_id, date)` primary key

---

## Storage-buckets (Supabase Storage)

| Bucket               | Privé | Doel                                  | Migratie |
|----------------------|-------|---------------------------------------|----------|
| `restaurant-assets`  | ❌ public | Logo's, menu-PDFs (legacy)        | 0003 ⚠️ anon-policies te open |
| `menu-uploads`       | ✅    | Vision-bron-bestanden (PDF/foto)      | 0011     |
| `campaign-media`     | ✅    | Foto's bij social/whatsapp-campagnes  | 0015     |

⚠️ **`restaurant-assets` heeft nu `anon insert/update/select`-policies**
— open punt voor security-hardening (zie BACKLOG).

---

## Migratie-overzicht

| # | File | Doel |
|---|------|------|
| 0001 | initial_schema | Alle basis-tabellen + RLS-skeleton |
| 0002 | … | Onboarding-RLS-policies |
| 0003 | account_profile_extensions | tagline/atmosphere/USPs/events + restaurant-assets bucket |
| 0004 | … | Backfill seeds |
| 0005 | … | Campaign-content-tabellen |
| 0006 | … | Permissions-overrides |
| 0007 | team_members_rpc | Team-management RPC |
| 0008 | invitations | Team-invites |
| 0009 | ai_usage | AI-call tracking |
| 0010 | onboarding_fields | website_url + onboarded_at |
| 0011 | menu_uploads | menu-uploads bucket + tabel + FK |
| 0012 | ai_usage_nullable_restaurant | Pre-onboarding AI logging |
| 0013 | menu_items_allergens | EU-allergeenkolom |
| 0014 | filly_variants_cache | filly_variants jsonb op campaigns + reviews |
| 0015 | campaign_media | campaign-media bucket + FK |
| 0016 | campaign_schedule_suggestion | Filly's schedule-cache |
| 0017 | remove_archived_campaign_status | `gearchiveerd`-status afgeschaft |
| 0018 | restaurant_business_details | KvK/BTW/contact/email-instellingen |
| 0019 | terrace_sun_periods | Terras-zon ochtend/middag/avond |
| 0020 | terrace_type | Open / overdekt / overdekbaar |

---

## Open punten op DB-niveau

Volgens [BACKLOG](../BACKLOG.md):
- `reservations.via_campaign_id` FK — voor échte Filly-ROI
- `guests.acquired_via_campaign_id` FK
- `campaigns.metrics` uitbreiding (extra_reservations / revenue / retention)
- `subscriptions` (Mollie-billing)
- `campaign_sends` (verzend-history)
- `guest_segments` (doelgroep-segmentatie persistent maken)
- `audit_log` daadwerkelijk vullen
- `restaurant-assets` Storage-policies aanscherpen
