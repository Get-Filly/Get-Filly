-- ============================================================
-- Get Filly — Migratie 0077
-- image_usage-tabel: elke beeld-call (Gemini) loggen voor kosten + caps
-- ============================================================
-- Doel (spiegelt ai_usage, maar voor de Filly-beeldtool):
--   1. Kosten-inzicht per business (beeld-calls zijn duur, ~$0,02-0,04/stuk)
--   2. Caps afdwingen: maand- en uur-limiet per business
--      (ImageStudioService.assertUnderCaps telt rijen in een tijdvenster)
--   3. Analyse per feature (enhance / edit / generate / reformat)
--
-- Design-beslissingen:
--   - Aparte tabel naast ai_usage: ander kosten-model (per beeld i.p.v.
--     per token) en een andere provider (Gemini i.p.v. Claude).
--   - Eén rij = één opgeleverd beeld (image_count blijft 1, maar staat als
--     kolom klaar mocht een call ooit meerdere beelden teruggeven).
--   - feature/operation/provider/model als vrije text: nieuwe standen of
--     een model-wissel vereisen geen migratie.
--   - Index op (business_id, created_at desc): exact de cap-query-vorm.
--   - Post-rename (mig 0068): business_id + public.businesses, niet
--     restaurant_id (ai_usage hield z'n oude kolomnaam, deze tabel is nieuw).
--
-- Hernummerd 2026-09-25: dit bestand heette 0071 op de branch waar het
-- gemaakt is (1 september), maar op main was 0071 intussen bezet door
-- 0071_campaign_performance_per_channel.sql. De tabelnaam verandert niet,
-- dus de code hoeft niet aangepast.
-- ============================================================

create table if not exists public.image_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- User mag null zijn (bv. als een achtergrond-job ooit beeld maakt).
  user_id uuid references public.users(id) on delete set null,
  -- Welke stand de call triggerde: 'image_enhance' | 'image_edit' |
  -- 'image_generate' | 'image_reformat' (fan-out). Vrije text.
  feature text not null,
  -- Provider + exacte model-id, voor latere kosten-/model-analyse.
  provider text not null,
  model text not null,
  -- 'generate' (geen invoerfoto) of 'edit' (met invoerfoto, incl. reformat).
  operation text not null,
  -- Aantal opgeleverde beelden in deze rij (nu altijd 1).
  image_count integer not null default 1 check (image_count >= 0),
  created_at timestamptz not null default now()
);

-- Cap-query draait als:
--   select count(*) from image_usage
--   where business_id = $1 and created_at >= $since
-- Dit index is daar op gebouwd (maand- én uur-venster).
create index if not exists image_usage_business_time_idx
  on public.image_usage(business_id, created_at desc);

-- Voor analyse per stand ("welke stand kost het meest").
create index if not exists image_usage_feature_time_idx
  on public.image_usage(feature, created_at desc);

-- RLS aan; de backend logt en telt via service_role (bypass). Geen policies
-- voor gewone users nodig tot we een usage-dashboard voor de klant bouwen.
alter table public.image_usage enable row level security;

comment on table public.image_usage is
  'Log van alle Gemini beeld-calls (Filly-beeldtool). Driver voor kosten-analyse en de maand-/uur-caps per business.';
