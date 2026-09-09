-- ============================================================
-- Get Filly — Migratie 0072
-- Fix: verwijderde campagnes blokkeerden de classify-wachtrij
-- ============================================================
-- Wat er misging in 0071:
--   De FOR-loop van classify_campaign_performance() joinde campaigns met
--   een INNER JOIN plus `where c.deleted_at is null`. campaign_id is
--   NOT NULL met een FK, dus de join zelf filtert nooit iets weg — maar
--   die deleted_at-voorwaarde wél. Performance-rijen die bij een
--   verwijderde (soft-deleted) campagne horen vielen daardoor buiten de
--   loop en hielden `classification = null`.
--
--   Gevolg: ze blijven eeuwig in de wachtrij zitten. De nachtelijke job
--   scant ze elke run opnieuw (limit 500) en verwerkt nul rijen, terwijl
--   de teller "wachtend op score" blijft staan. Op de productie-database
--   waren dat 32 rijen: de functie gaf 0/0/0/0/0 terug terwijl er 32
--   rijen aan de voorwaarden leken te voldoen.
--
--   Vóór 0071 gebeurde dit niet: die versie joinde helemaal niet op
--   campaigns en zette zulke rijen op 'no_data'.
--
-- De fix:
--   1. LEFT JOIN i.p.v. INNER JOIN, en de deleted_at-voorwaarde uit de
--      WHERE. Elke rij die aan de meet-voorwaarden voldoet komt nu in de
--      loop, ook die van een verwijderde campagne.
--   2. Hoort de rij bij een verwijderde campagne? Dan meteen 'no_data' +
--      measurement_complete_at. Zo verlaat hij de wachtrij en blijft hij
--      buiten Filly's leerloop — een campagne die de eigenaar heeft
--      weggegooid hoort niet mee te wegen in wat "werkt".
--
-- De rest van de functie (de drie score-paden, de baselines, de
-- kanaal-resolutie) is ongewijzigd t.o.v. 0071.
--
-- Idempotent: create or replace. Veilig om opnieuw te draaien.
-- ============================================================

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
  -- VOORLOPIGE baselines, zie de kop van 0071. Bijstellen zodra we
  -- genoeg eigen uitingen hebben gemeten.
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
      -- Hoort deze rij bij een campagne die weg is? Dan scoren we niet,
      -- maar zetten we 'm wel af zodat hij de wachtrij verlaat.
      (c.id is null or c.deleted_at is not null) as campagne_weg,
      -- Kanaal-resolutie hier INLINE en niet via campaign_channel_map:
      -- die view is security_invoker, en binnen een security definer-
      -- functie is de aanroepende rol de functie-eigenaar. Dat werkt,
      -- maar het is precies het soort subtiliteit dat stil kapot gaat.
      -- Zelfde CASE als in de view: houd ze gelijk als je er één aanpast.
      case
        when c.type = 'social' and sc.platforms is not null
             and array_length(sc.platforms, 1) > 0
          then sc.platforms[1]
        when c.type = 'social' then 'instagram'
        else c.type
      end as channel
    from public.campaign_performance p
    -- LEFT JOIN: een verwijderde campagne mag de rij niet uit de loop
    -- houden (dat was de bug in 0071).
    left join public.campaigns c on c.id = p.campaign_id
    left join public.campaign_social_content sc on sc.campaign_id = p.campaign_id
    where p.classification is null
      and p.marked_outlier = false
      and p.created_at < now() - interval '14 days'
    limit 500
  loop
    v_score := null;
    v_class := null;
    v_basis := null;
    v_baseline := null;
    v_denominator := null;

    if r.campagne_weg then
      -- Campagne is verwijderd: buiten de leerloop houden, maar wel
      -- afsluiten zodat de nachtelijke job hem niet blijft oppakken.
      v_class := 'no_data';

    -- ---- a. RATE-score per kanaal-familie ----
    elsif r.channel = 'mail' then
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

    if v_class is null and v_score is not null then
      v_basis := 'rate';
      if v_score >= round(v_baseline * winner_mult) then
        v_class := 'winner';
      elsif v_score <= round(v_baseline * under_mult) then
        v_class := 'underperformer';
      else
        v_class := 'average';
      end if;

    -- ---- b. CONVERSION_ONLY: geen bereik-data, wel boekingen ----
    elsif v_class is null and r.reservations_attributed > 0 then
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
    elsif v_class is null then
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
  'Scoort campagne-performance + classification zodra het meet-window (14d) verstreken is. Drie paden: rate-score per kanaal-familie (mail/social/google_business, elk eigen weging + baseline), conversion_only-score op boekingen t.o.v. de eigen mediaan als bereik-data ontbreekt, anders no_data. Rijen van verwijderde campagnes krijgen no_data zodat ze de wachtrij verlaten zonder de leerloop te vervuilen (fix 0072). Kosten blijven buiten de score; die staan in campaign_performance_report. pg_cron daily 03:17 UTC, idempotent.';
