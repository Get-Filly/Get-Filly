# Get-Filly — Database-schema

Overzicht van alle tabellen, hun rol in het systeem en de belangrijkste
relaties. **Bron-of-waarheid blijven de SQL-migraties** in
[`apps/api/supabase/migrations/`](../../apps/api/supabase/migrations/) — dit
document is een leeswijzer, geen specificatie.

Bijgewerkt t/m **migratie 0076** (september 2026).

> **Let op de rename van mig 0068.** `restaurants` heet nu `businesses`,
> `restaurant_id` heet `business_id`, en dat geldt voor élke tabel die die kolom
> had. Ook `restaurant_users`→`business_users`, `restaurant_media`→
> `business_media`, `restaurant_chat_memory`→`business_chat_memory`. Oudere
> migratiebestanden gebruiken nog de oude namen; dat klopt, die draaiden vóór de
> rename.

---

## Multi-tenant model

Alle klantdata hangt aan een `business_id`. Een gebruiker kan via
`business_users` aan meerdere zaken gekoppeld zijn (rol: owner / manager /
staff). De backend gebruikt de `service_role`-sleutel en isoleert tenants in
TypeScript-guards (`BusinessAccessGuard`); RLS staat aan maar wordt door die
sleutel omzeild. Queries scopen daarom dubbel op `(entity_id + business_id)` —
defense-in-depth.

Elke zaak heeft sinds mig 0066 een `industry` (horeca, wellness, kappers,
sportscholen, recreatie). Filly's brein laadt daar een branche-pack bij.

---

## Identiteit & accounts

### `users` (extensie van `auth.users`)
- `id` uuid → `auth.users(id)` on delete cascade
- `full_name`, `avatar_url`
- `notification_prefs` jsonb — `{ email, in_app, push }`
- `two_factor_enabled` boolean (UI nog niet)

### `businesses` (de zaak zelf)
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

### `business_users` (n-op-m koppel)
- `(business_id, user_id)` primary key
- `role` (`owner`/`manager`/`staff`)

---

## Gasten + reserveringen

### `guests`
Persoonlijke gegevens van bezoekers.
- `id`, `business_id`, `name`, `email`, `phone`
- `preferences` jsonb (allergies, voorkeuren)
- `lifetime_visits`, `last_visit_at`
- `opt_in_marketing` boolean
- `acquired_via_campaign_id` — **TODO**: FK naar `campaigns(id)`
  ontbreekt nog (zie BACKLOG)

### `guest_visits`
Historisch bezoek-log.
- `business_id`, `guest_id`, `visit_date`, `party_size`
- `source` (`reservation`/`walk_in`), `is_no_show`

### `reservations`
Geplande bezoeken.
- `business_id`, `guest_id`, `guest_name`, `guest_phone`, `guest_email`
- `reservation_date`, `reservation_time`, `party_size`
- `status` (`bevestigd`/`ingecheckt`/`voltooid`/`no_show`/`geannuleerd`)
- `source` (`handmatig` / integratie-naam)
- `via_campaign_id` — **TODO**: FK naar `campaigns(id)` ontbreekt nog

### `occupancy_days`
Pre-aggregeerde bezetting per dag.
- `(business_id, date)` primary key
- `occupancy_pct`, `estimated_guests`, `revenue_cents`

---

## Menu

### `menu_items`
- `id`, `business_id`, `name`, `description`, `category`
- `price_cents`, `is_signature`, `is_seasonal`, `season`,
  `is_available`, `display_order`
- `dietary_tags[]` (vegan, vegetarian, gluten_free)
- `allergens[]` (toegevoegd in 0013, EU-allergeencodes)
- `photo_url`
- `menu_upload_id` → `menu_uploads(id)` (toegevoegd in 0011, on delete
  set null) — koppelt automatisch geïmporteerde items aan hun upload

### `menu_uploads` (0011)
Audit-trail van geüploade menukaarten.
- `business_id`, `file_path` (in `menu-uploads` Storage-bucket)
- `file_name`, `file_size_bytes`, `mime_type`
- `processed_at`, `extracted_items_count`, `processing_error`
- `uploaded_by` → `users(id)`

---

## Campagnes

### `campaigns` (header)
- `id`, `business_id`, `name`, `type` (`mail`/`social`/`whatsapp`)
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
- `business_id` (nullable sinds 0012 voor pre-onboarding)
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
- `(business_id, date)` primary key

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

## Sinds migratie 0020 erbij gekomen

De secties hierboven dekken het schema t/m mig 0020. Onderstaande tabellen zijn
daarna toegevoegd, gegroepeerd per onderwerp. Kolommen staan hier beknopt; de
migratie ernaast is de volledige definitie.

### Drukte & rustige momenten

| Tabel | Mig | Wat erin staat |
|---|---|---|
| `busyness_snapshots` | 0062 | Elke meting van Google "populaire tijden": `pattern` (het weekpatroon), `live_pct` + `live_hour` + `live_weekday` (de momentmeting) en `raw`. Wordt na 120 dagen geprund. |
| `busyness_monthly` | 0075 | Maandoverzicht per `(business_id, month, weekday, hour)`: `actual_pct`, `expected_pct` en `days` (op hoeveel dagen de mediaan rust). Wordt weggeschreven **vóór** de prune, zodat "vs vorig jaar" over twaalf maanden alsnog kan. |
| `campaign_quiet_effect` | 0074 | De terugkoppeling: werd het dagdeel waarvoor een campagne bedoeld was ook echt voller? `actual_pct` vs `baseline_pct` geeft `lift`, met `baseline_days` en `measured_hours` als betrouwbaarheidsmaat. |
| `events` / `event_places` | 0053 | Evenementen in de buurt (evenementen.nl) met hun geocodering, als signaal voor de verwachte drukte per datum. |

### Campagnes

| Tabel | Mig | Wat erin staat |
|---|---|---|
| `campaign_social_content` | 0001/0005 | Caption, hashtags, `media_urls`, `platforms[]`, `cta_link`, `stats`. Let op: de kolommen heten `platforms` en `hashtags`, niet `social_*`. |
| `campaign_whatsapp_content` | 0001/0005 | Berichttekst, media, WhatsApp-templatenaam + parameters. |
| `campaign_sends` | 0030 | Verzendhistorie per ontvanger, met Resend-message-id en status (`queued` → `sent` → `delivered` / `bounced` / `complained` / …). Superseedt `campaign_recipients`. |
| `unsubscribe_tokens` | 0030 | Uitschrijflinks in verstuurde mail. Blijft bestaan ook nu mail geen campagnekanaal meer is: al verstuurde mails moeten die link houden. |
| `campaign_performance` | 0046 | Gemeten resultaat per campagne, per kanaal: mail (delivered/opened/clicked/bounced), social (reach, impressions, engagement, saves, videoweergaven, kijktijd). |
| `campaign_style_fingerprints` | 0048 | Anti-repetitie: openingszin, hashtag-set, CTA-sjabloon en thema per campagne + kanaal, zodat Filly zichzelf niet herhaalt. |
| `campaign_groups` | 0032 | Campagnes bundelen onder één thema. |
| `campaign_benchmarks` | 0023 | Geanonimiseerde campagnekenmerken (type zaak, regio als provincie, capaciteitsklasse, maand, thema) zonder body en zonder FK — AVG-overweging 26. Nog leeg. |

### Filly's geheugen & sturing

| Tabel | Mig | Wat erin staat |
|---|---|---|
| `chat_messages` | 0001 | Berichten per gesprek, met `message_card` voor inline voorstellen en `tokens_in`/`tokens_out` voor kostenmeting. |
| `filly_config` | 0001 | Per zaak: toon, budget voor automatisch goedkeuren, toegestane kanalen, huisregels. |
| `filly_goals` | 0001 | Doelen met metriek, streefwaarde en datum. |
| `business_chat_memory` | 0001 (hernoemd 0068) | Wat Filly over de zaak onthoudt tussen gesprekken door. |

### Vindbaarheid (health-score)

| Tabel | Mig | Wat erin staat |
|---|---|---|
| `health_scores` | 0045 | Eén run: totaalscore plus sub-scores voor SEO, Google Bedrijfsprofiel, reviews en GEO, met `runner_version` en `run_source`. |
| `health_findings` | 0045 | Per check: geslaagd of niet, ernst, verloren punten, uitleg en een concrete fix. |
| `health_competitors` | 0045 | Concurrenten binnen een straal, met hun score en de eigen positie daarin. |

### Koppelingen, team & beheer

| Tabel | Mig | Wat erin staat |
|---|---|---|
| `integration_credentials` | 0052 | Versleutelde OAuth-tokens per provider (Meta, Google Bedrijfsprofiel, TikTok), met scopes en vervaldatum. |
| `invitations` | 0008 | Teamuitnodigingen met token, rol, rechten en vervaldatum (7 dagen). |
| `account_deletions` | 0023 | Log van verwijderde accounts: hoeveel zaken weg, hoeveel campagnes geanonimiseerd. |
| `rate_limit_counters` | 0076 | De rem per IP: `(bucket, client_key, window_start)` met een teller. `client_key` is een gehasht IP of user-id. |
| `suggested_menu_items` | 0029 | Menuvoorstellen van Filly, met de reden (gat in het menu, past bij het profiel, seizoen) en een prijsbandbreedte. |

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

Vanaf 0021 staat de beschrijving in het migratiebestand zelf — elk bestand opent
met een commentaarblok dat uitlegt wat het doet en waarom. Een paar die je
vaker tegenkomt: **0045** health-score, **0052** versleutelde OAuth-tokens,
**0053** evenementen, **0062** drukte-metingen, **0066** branche, **0068** de
rename naar `business`, **0074** terugkoppeling op rustige momenten, **0075**
maandoverzicht, **0076** rem per IP.

---

## Open punten op DB-niveau

Volgens [BACKLOG](../../BACKLOG.md):
- `reservations.via_campaign_id` FK — voor échte Filly-ROI
- `guests.acquired_via_campaign_id` FK
- `campaigns.metrics` uitbreiding (extra_reservations / revenue / retention)
- `subscriptions` (Mollie-billing)
- `guest_segments` (doelgroep-segmentatie persistent maken)
- `audit_log` daadwerkelijk vullen
- `restaurant-assets` Storage-policies aanscherpen
