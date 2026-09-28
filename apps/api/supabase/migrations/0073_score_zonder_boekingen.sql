-- ============================================================
-- Get Filly — Migratie 0073
-- Score zonder boekingen: alleen op wat we echt kunnen meten
-- ============================================================
-- Waarom:
--   In 0071/0072 woog de conversie (reservations_attributed) zwaar mee:
--   bij sociale kanalen zelfs 50 van de 100 punten, en er was een
--   conversion_only-pad dat volledig op boekingen scoorde.
--
--   Besluit 2026-09-09: we kunnen reserveringen niet uitlezen. Meta,
--   TikTok en Google rapporteren via hun API's wél bereik, doorkliks,
--   interacties en besteed budget, maar niet of iemand daarna een tafel
--   boekt. Zolang er geen koppeling met een reserveringssysteem is, komt
--   reservations_attributed alleen uit een handmatige toewijzing door de
--   eigenaar. Dat is geen meting, en het hoort dus niet in een score die
--   Filly gebruikt om te leren wat werkt.
--
--   Twee concrete problemen die dit oploste:
--     1. Zonder boekingen kon een sociale uiting maximaal 50 punten
--        halen tegen een baseline van 60. Élke uiting werd daardoor
--        'underperformer'. De score was actief kapot.
--     2. Het conversion_only-pad scoorde op door de eigenaar ingevulde
--        getallen, en voedde die terug in de leerloop. Dat is een
--        zichzelf-bevestigende lus.
--
-- Wat er verandert:
--   - Elke kanaal-familie heeft nu TWEE componenten van 50 punten, en
--     geen conversie-component.
--   - Het conversion_only-pad is weg. Geen bruikbare noemer (bereik,
--     impressies of afleveringen) = 'no_data'. Dat is eerlijk: dan weten
--     we het gewoon niet.
--   - score_basis krijgt alleen nog 'rate'. De check-constraint laat
--     'conversion_only' nog toe, zodat bestaande rijen geldig blijven.
--
-- Baselines = de score die een middelmatige uiting haalt volgens de
--   gangbare vuistregels, ingevuld in de formule hieronder. Winner is
--   1,30× die baseline, underperformer 0,70× (zelfde marges als 0050).
--   Zodra we genoeg eigen uitingen hebben gemeten, stellen we ze bij.
--
--   mail   : 25% opens → 42 pt, 1,8% clicks → 23 pt  = 64
--   social : 4% interactie → 40 pt, 0,7% doorklik → 35 pt = 75
--   gbp    : 4% doorklik → 40 pt, 1,5% actie → 38 pt = 77
--
-- LET OP: rijen die onder 0071/0072 al een classification hebben, worden
--   niet herbeoordeeld (de functie pakt alleen classification is null).
--   Wil je alles met de nieuwe formule laten scoren, gebruik dan de
--   reset onderaan dit bestand.
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

  mail_baseline constant numeric := 64;
  social_baseline constant numeric := 75;
  gbp_baseline constant numeric := 77;
  winner_mult constant numeric := 1.30;
  under_mult constant numeric := 0.70;
begin
  for r in
    select
      p.id,
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
      (c.id is null or c.deleted_at is not null) as campagne_weg,
      -- Kanaal-resolutie inline; zelfde CASE als in campaign_channel_map.
      -- Houd ze gelijk als je er één aanpast.
      case
        when c.type = 'social' and sc.platforms is not null
             and array_length(sc.platforms, 1) > 0
          then sc.platforms[1]
        when c.type = 'social' then 'instagram'
        else c.type
      end as channel
    from public.campaign_performance p
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
      -- Campagne verwijderd: buiten de leerloop, maar wel afsluiten zodat
      -- de nachtelijke job hem niet blijft oppakken (fix uit 0072).
      v_class := 'no_data';

    elsif r.channel = 'mail' then
      v_denominator := nullif(coalesce(r.mail_delivered, 0), 0);
      if v_denominator is not null then
        v_baseline := mail_baseline;
        v_score := round(
          -- 30% opens = de volle 50 punten.
          least(50, (coalesce(r.mail_opened, 0)::numeric / v_denominator) * 167)
          -- 4% doorkliks = de volle 50 punten.
          + least(50, (coalesce(r.mail_clicked, 0)::numeric / v_denominator) * 1250)
        );
      end if;

    elsif r.channel = 'google_business' then
      v_denominator := nullif(coalesce(r.gbp_impressions, 0), 0);
      if v_denominator is not null then
        v_baseline := gbp_baseline;
        v_score := round(
          -- 5% doorklik-ratio = de volle 50 punten.
          least(50, (coalesce(r.gbp_clicks, 0)::numeric / v_denominator) * 1000)
          -- 2% bellen-of-route = de volle 50 punten.
          + least(50, ((coalesce(r.gbp_calls, 0) + coalesce(r.gbp_directions, 0))::numeric / v_denominator) * 2500)
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
          -- 5% interactie op bereik = de volle 50 punten.
          least(50, (coalesce(r.social_engagement, 0)::numeric / v_denominator) * 1000)
          -- 1% doorklik = de volle 50 punten.
          + least(50, (coalesce(r.link_clicks, 0)::numeric / v_denominator) * 5000)
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
    elsif v_class is null then
      -- Geen bruikbare noemer. Vóór 0073 viel dit terug op een score over
      -- de toegewezen boekingen; dat pad is bewust weg. Zonder gemeten
      -- bereik weten we het niet, en dat zeggen we.
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
  'Scoort campagne-performance zodra het meet-window (14d) verstreken is, uitsluitend op gemeten platform-cijfers: per kanaal-familie twee componenten van 50 punten (mail opens+clicks, social interactie+doorklik, gbp doorklik+actie) t.o.v. een baseline (64/75/77), winner >= 1,30x, underperformer <= 0,70x. Geen conversie-component en geen conversion_only-pad: reserveringen zijn niet meetbaar zonder koppeling met een reserveringssysteem (besluit 0073). Geen bruikbare noemer of verwijderde campagne = no_data. pg_cron daily 03:17 UTC, idempotent.';

-- ------------------------------------------------------------
-- Optioneel: alles opnieuw laten scoren met de nieuwe formule
-- ------------------------------------------------------------
-- De functie pakt alleen rijen met classification is null, dus rijen die
-- onder de oude formule al beoordeeld zijn houden hun oude score. Wil je
-- schoon herbeginnen:
--
-- update public.campaign_performance
-- set classification = null, success_score = null,
--     score_basis = null, measurement_complete_at = null;
--
-- select * from public.classify_campaign_performance();
