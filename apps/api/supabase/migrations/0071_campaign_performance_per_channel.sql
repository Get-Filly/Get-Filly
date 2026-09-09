-- ============================================================
-- Get Filly — Migratie 0071
-- Succes-score per kanaal (was: alleen mail) + rapportage-view
-- ============================================================
-- Achtergrond:
--   De classificatie uit 0047/0050 rekent uitsluitend met mail-metrics
--   (open-rate, click-rate, conversie per mail_delivered). Elke campagne
--   zonder mail-data kreeg daardoor classification='no_data' en
--   success_score=null. Nu sociale media het hoofdkanaal is, betekende dat:
--   Filly's leerloop staat stil en "boekingen per uiting" is leeg.
--
--   Deze migratie doet drie dingen:
--     1. Vier kolommen erbij die zowel voor betaald als organisch nodig
--        zijn: spend_cents, link_clicks, paid, score_basis.
--     2. classify_campaign_performance() herschreven naar één score per
--        kanaal-familie (mail / social / google_business), met een
--        conversie-fallback zodat er VANDAAG al gescoord wordt, zonder
--        nieuwe API-scopes.
--     3. Een view campaign_performance_report die de rapportage-pagina
--        in één query kan lezen (per uiting: kanaal, betaald/organisch,
--        bereik, doorkliks, boekingen, omzet, kosten, kosten per boeking).
--
-- Kanaal-resolutie: campaigns.type is 'mail' | 'social' | 'whatsapp'; het
--   ECHTE kanaal staat in campaign_social_content.platforms[] (vrij
--   tekstveld, geen constraint). We leiden het kanaal daarom af met een
--   join i.p.v. het te denormaliseren — dan kan het niet uit sync lopen.
--
-- Baselines: de mail-baseline (53) komt uit 0050 en blijft ongemoeid. De
--   social- en GBP-baselines hieronder zijn VOORLOPIG en staan als
--   constante bovenaan de functie, zodat we ze kunnen bijstellen zodra er
--   eigen data is. Ze zijn gekozen zodat een middelmatige uiting rond de
--   baseline uitkomt, niet als hard bewijs uit een benchmark-rapport.
--
-- Idempotent: add column if not exists + create or replace + drop/create
--   view. Veilig om opnieuw te draaien.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nieuwe kolommen
-- ------------------------------------------------------------
alter table public.campaign_performance
  -- Advertentiebudget dat aan DEZE uiting is besteed. 0 = organisch.
  -- Wordt gevuld zodra de ads-koppeling er is; tot dan blijft het 0 en
  -- rapporteert de UI "organisch".
  add column if not exists spend_cents bigint not null default 0,
  -- Doorkliks naar de site/reserveringspagina. Kanaal-onafhankelijk: we
  -- meten dit op onze eigen kant (UTM-redirect), niet bij het platform,
  -- dus dit werkt voor organisch én betaald.
  add column if not exists link_clicks integer,
  -- Was dit een betaalde uiting? Expliciet i.p.v. afgeleid uit
  -- spend_cents > 0, want een advertentie kan (nog) €0 besteed hebben.
  add column if not exists paid boolean not null default false,
  -- Hoe de score tot stand kwam, zodat de UI eerlijk kan zijn:
  --   'rate'            = op ratio's t.o.v. bereik/impressies
  --   'conversion_only' = alleen op boekingen t.o.v. je eigen mediaan
  --                       (bereik nog onbekend)
  add column if not exists score_basis text
    check (score_basis is null or score_basis in ('rate', 'conversion_only'));

comment on column public.campaign_performance.spend_cents is
  'Advertentiebudget besteed aan deze uiting, in centen. 0 = organisch.';
comment on column public.campaign_performance.link_clicks is
  'Doorkliks naar de site, gemeten op onze eigen UTM-redirect. Kanaal-onafhankelijk.';
comment on column public.campaign_performance.paid is
  'true = betaalde uiting (advertentie), false = organische post.';
comment on column public.campaign_performance.score_basis is
  'Hoe success_score berekend is: rate (ratio t.o.v. bereik) of conversion_only (boekingen t.o.v. eigen mediaan).';

create index if not exists idx_campaign_performance_paid
  on public.campaign_performance(business_id, paid);

-- ------------------------------------------------------------
-- 2. Kanaal-resolutie als helper-view
-- ------------------------------------------------------------
-- Eén plek waar we campaigns.type + platforms[] terugbrengen naar één
-- kanaal-label. Zowel de classify-functie als de rapportage-view lezen
-- hieruit, zodat ze niet uit elkaar kunnen lopen.
--
-- security_invoker: de view draait met de rechten van de aanroeper, dus
-- de RLS-policies op campaigns blijven gelden. Zonder deze optie zou de
-- view de rechten van de owner gebruiken en RLS omzeilen.
create or replace view public.campaign_channel_map
with (security_invoker = on) as
select
  c.id as campaign_id,
  c.business_id,
  c.name,
  c.type,
  c.status,
  coalesce(c.executed_at, c.scheduled_for) as happened_at,
  case
    -- Het eerste platform in platforms[] is het kanaal van deze uiting.
    -- Een campagne is sinds de bundel-opzet altijd één kanaal; een
    -- bundel is meerdere campagnes onder één campaign_groups-rij.
    when c.type = 'social' and sc.platforms is not null
         and array_length(sc.platforms, 1) > 0
      then sc.platforms[1]
    -- Legacy: social-campagne van vóór de platforms[]-kolom.
    when c.type = 'social' then 'instagram'
    else c.type
  end as channel
from public.campaigns c
left join public.campaign_social_content sc on sc.campaign_id = c.id
where c.deleted_at is null;

comment on view public.campaign_channel_map is
  'Brengt campaigns.type + campaign_social_content.platforms[] terug naar één kanaal-label per uiting (instagram/facebook/tiktok/youtube/google_business/mail/whatsapp). Gedeeld door de classify-functie en de rapportage-view.';

-- Expliciete grants: Supabase zet default privileges voor de postgres-rol,
-- maar een ontbrekende grant geeft een verwarrende "permission denied for
-- view". Bewust GEEN anon: dit zijn bedrijfsgegevens.
grant select on public.campaign_channel_map to authenticated, service_role;

-- ------------------------------------------------------------
-- 3. classify_campaign_performance() — nu per kanaal
-- ------------------------------------------------------------
-- Drie score-paden, in deze volgorde:
--
--   a. RATE-score, als er een bruikbare noemer is:
--        mail            → mail_delivered
--        social          → social_reach, anders social_impressions
--        google_business → gbp_impressions
--      Elke familie heeft eigen wegingen en een eigen baseline. De
--      classificatie is relatief: winner >= baseline*1.30,
--      underperformer <= baseline*0.70 (zelfde marges als 0050).
--
--   b. CONVERSION_ONLY-score, als er GEEN noemer is maar wél boekingen.
--      Dit is het pad dat vandaag werkt: zonder Insights-scopes weten we
--      het bereik niet, maar de toegeschreven boekingen kennen we wel
--      (reservations.via_campaign_id, migratie 0022). We zetten de uiting
--      af tegen de eigen mediaan van dit bedrijf:
--        score = least(100, round(50 * boekingen / mediaan))
--      Mediaan = mediaan boekingen over de eerder gescoorde uitingen van
--      dit bedrijf; minder dan 3 samples → mediaan 2 als neutrale start.
--      Zo krijgt "gelijk aan je eigen normaal" 50 punten, en het dubbele
--      100. Winner >= 65, underperformer <= 35 (= 1,3× resp. 0,7× mediaan).
--
--   c. no_data, als er geen noemer én geen boekingen is. Dan valt er
--      niets te zeggen en dat zeggen we ook.
--
-- Kosten blijven bewust BUITEN de score: een score van 0-100 moet
-- vergelijkbaar zijn tussen organisch en betaald. Kosten per boeking
-- rapporteren we los, in de view hieronder.
create or replace function public.classify_campaign_performance()
returns table(
  processed integer,
  winners integer,
  average_count integer,
  underperformers integer,
  no_data_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_winners integer := 0;
  v_average integer := 0;
  v_under integer := 0;
  v_no_data integer := 0;
  r record;
  v_score integer;
  v_class text;
  v_basis text;
  v_baseline numeric;
  v_denominator numeric;
  v_median numeric;

  -- Mail-baseline uit migratie 0050 (Mailchimp "Restaurant" /
  -- Campaign Monitor food & beverage 2024). Ongewijzigd.
  mail_baseline constant numeric := 53;
  -- VOORLOPIGE baselines. Afgeleid uit de veelgenoemde vuistregels voor
  -- kleine lokale accounts (engagement op bereik ~4%, doorklik ~0,7%,
  -- conversie ~0,25%) ingevuld in de formules hieronder. Bijstellen
  -- zodra we genoeg eigen uitingen hebben gemeten.
  social_baseline constant numeric := 60;
  gbp_baseline constant numeric := 55;
  winner_mult constant numeric := 1.30;
  under_mult constant numeric := 0.70;
begin
  for r in
    select
      p.id,
      p.business_id,
      p.mail_delivered,
      p.mail_opened,
      p.mail_clicked,
      p.social_reach,
      p.social_impressions,
      p.social_engagement,
      p.social_video_views,
      p.gbp_impressions,
      p.gbp_clicks,
      p.gbp_calls,
      p.gbp_directions,
      p.link_clicks,
      p.reservations_attributed,
      -- Kanaal-resolutie hier INLINE en niet via campaign_channel_map:
      -- die view is security_invoker, en binnen een security definer-
      -- functie is de aanroepende rol de functie-eigenaar. Dat werkt,
      -- maar het is precies het soort subtiliteit dat stil kapot gaat
      -- (0 rijen verwerkt, niemand die het ziet). Zelfde CASE als in de
      -- view: houd ze gelijk als je er één aanpast.
      case
        when c.type = 'social' and sc.platforms is not null
             and array_length(sc.platforms, 1) > 0
          then sc.platforms[1]
        when c.type = 'social' then 'instagram'
        else c.type
      end as channel
    from public.campaign_performance p
    join public.campaigns c on c.id = p.campaign_id
    left join public.campaign_social_content sc on sc.campaign_id = p.campaign_id
    where c.deleted_at is null
      and p.classification is null
      and p.marked_outlier = false
      and p.created_at < now() - interval '14 days'
    limit 500
  loop
    v_score := null;
    v_class := null;
    v_basis := null;
    v_baseline := null;
    v_denominator := null;

    -- ---- a. RATE-score per kanaal-familie ----
    if r.channel = 'mail' then
      v_denominator := nullif(coalesce(r.mail_delivered, 0), 0);
      if v_denominator is not null then
        v_baseline := mail_baseline;
        v_score := round(
          least(30, (coalesce(r.mail_opened, 0)::numeric / v_denominator) * 100)
          + least(50, (coalesce(r.mail_clicked, 0)::numeric / v_denominator) * 1000)
          + least(20, (r.reservations_attributed::numeric / v_denominator) * 1000)
        );
      end if;

    elsif r.channel = 'google_business' then
      v_denominator := nullif(coalesce(r.gbp_impressions, 0), 0);
      if v_denominator is not null then
        v_baseline := gbp_baseline;
        v_score := round(
          -- 5% doorklik-ratio = de volle 30 punten.
          least(30, (coalesce(r.gbp_clicks, 0)::numeric / v_denominator) * 600)
          -- 2% bellen-of-route = de volle 30 punten.
          + least(30, ((coalesce(r.gbp_calls, 0) + coalesce(r.gbp_directions, 0))::numeric / v_denominator) * 1500)
          -- 0,5% boekingen = de volle 40 punten.
          + least(40, (r.reservations_attributed::numeric / v_denominator) * 8000)
        );
      end if;

    else
      -- Alle sociale kanalen (instagram / facebook / tiktok / youtube).
      -- Bereik is de eerlijkste noemer; valt terug op impressies, en voor
      -- video op weergaven, want daar is dat de gerapporteerde eenheid.
      v_denominator := nullif(
        coalesce(r.social_reach, r.social_impressions, r.social_video_views, 0), 0
      );
      if v_denominator is not null then
        v_baseline := social_baseline;
        v_score := round(
          -- 5% interactie op bereik = de volle 25 punten.
          least(25, (coalesce(r.social_engagement, 0)::numeric / v_denominator) * 500)
          -- 1% doorklik = de volle 25 punten.
          + least(25, (coalesce(r.link_clicks, 0)::numeric / v_denominator) * 2500)
          -- 0,5% boekingen = de volle 50 punten. Boekingen wegen zwaarst:
          -- dat is wat we beloven te meten, niet likes.
          + least(50, (r.reservations_attributed::numeric / v_denominator) * 10000)
        );
      end if;
    end if;

    if v_score is not null then
      v_basis := 'rate';
      if v_score >= round(v_baseline * winner_mult) then
        v_class := 'winner';
      elsif v_score <= round(v_baseline * under_mult) then
        v_class := 'underperformer';
      else
        v_class := 'average';
      end if;

    -- ---- b. CONVERSION_ONLY: geen bereik-data, wel boekingen ----
    elsif r.reservations_attributed > 0 then
      select percentile_cont(0.5) within group (order by p2.reservations_attributed)
        into v_median
      from public.campaign_performance p2
      where p2.business_id = r.business_id
        and p2.id <> r.id
        and p2.classification is not null
        and p2.classification <> 'no_data'
        and p2.marked_outlier = false;

      -- Te weinig eigen historie → 2 boekingen als neutrale start, zodat
      -- de eerste uitingen niet automatisch 'winner' worden.
      if v_median is null or v_median < 1 then
        v_median := 2;
      end if;

      v_basis := 'conversion_only';
      v_score := least(
        100,
        round(50 * (r.reservations_attributed::numeric / v_median))
      );
      if v_score >= 65 then
        v_class := 'winner';
      elsif v_score <= 35 then
        v_class := 'underperformer';
      else
        v_class := 'average';
      end if;

    -- ---- c. Niets te zeggen ----
    else
      v_class := 'no_data';
    end if;

    update public.campaign_performance
    set
      success_score = case when v_class = 'no_data' then null else v_score end,
      classification = v_class,
      score_basis = v_basis,
      measurement_complete_at = now()
    where id = r.id;

    if v_class = 'winner' then
      v_winners := v_winners + 1;
    elsif v_class = 'average' then
      v_average := v_average + 1;
    elsif v_class = 'underperformer' then
      v_under := v_under + 1;
    else
      v_no_data := v_no_data + 1;
    end if;
    v_processed := v_processed + 1;
  end loop;

  return query select v_processed, v_winners, v_average, v_under, v_no_data;
end;
$$;

comment on function public.classify_campaign_performance is
  'Scoort campagne-performance + classification zodra het meet-window (14d) verstreken is. Drie paden: rate-score per kanaal-familie (mail/social/google_business, elk eigen weging + baseline), conversion_only-score op boekingen t.o.v. de eigen mediaan als bereik-data ontbreekt, anders no_data. Kosten blijven buiten de score; die staan in campaign_performance_report. pg_cron daily 03:17 UTC, idempotent.';

-- ------------------------------------------------------------
-- 4. Rapportage-view
-- ------------------------------------------------------------
-- Eén rij per uiting met alles wat de rapportage-pagina nodig heeft,
-- zodat de frontend geen vijf joins hoeft te doen. Bewust een view en
-- geen materialized view: de volumes zijn klein (uitingen per bedrijf)
-- en we willen geen refresh-job.
--
-- security_invoker: RLS van campaign_performance + campaigns blijft
-- gelden, dus een gebruiker ziet alleen z'n eigen bedrijven.
drop view if exists public.campaign_performance_report;
create view public.campaign_performance_report
with (security_invoker = on) as
select
  p.campaign_id,
  p.business_id,
  m.name as campaign_name,
  m.channel,
  m.status,
  m.happened_at,
  p.paid,
  -- Bereik: wat het platform rapporteert, met dezelfde voorkeur als de
  -- score (bereik → impressies → weergaven), plus mail als eigen bron.
  case
    when m.channel = 'mail' then p.mail_delivered
    when m.channel = 'google_business' then p.gbp_impressions
    else coalesce(p.social_reach, p.social_impressions, p.social_video_views)
  end as reach,
  case
    when m.channel = 'mail' then p.mail_clicked
    when m.channel = 'google_business' then p.gbp_clicks
    else p.link_clicks
  end as clicks,
  case
    when m.channel = 'mail' then p.mail_opened
    when m.channel = 'google_business'
      then coalesce(p.gbp_calls, 0) + coalesce(p.gbp_directions, 0)
    else p.social_engagement
  end as interactions,
  p.reservations_attributed as bookings,
  p.guests_attributed as guests,
  p.revenue_attributed_cents as revenue_cents,
  p.spend_cents,
  -- Kosten per boeking, alleen als er zowel budget als boekingen zijn.
  case
    when p.spend_cents > 0 and p.reservations_attributed > 0
      then round(p.spend_cents::numeric / p.reservations_attributed)
  end as cost_per_booking_cents,
  -- Opbrengst per euro advertentiebudget (ROAS).
  case
    when p.spend_cents > 0
      then round(p.revenue_attributed_cents::numeric / p.spend_cents, 2)
  end as roas,
  p.success_score,
  p.classification,
  p.score_basis,
  p.marked_outlier,
  p.measurement_complete_at,
  p.updated_at
from public.campaign_performance p
join public.campaign_channel_map m on m.campaign_id = p.campaign_id;

comment on view public.campaign_performance_report is
  'Eén rij per uiting voor de rapportage-pagina: kanaal, betaald/organisch, bereik, doorkliks, interacties, boekingen, gasten, omzet, budget, kosten per boeking, ROAS en de score. Werkt voor organisch (kosten 0) en betaald.';

grant select on public.campaign_performance_report to authenticated, service_role;
