-- ============================================================
-- Get Filly — Migratie 0050
-- Classify-drempels op afgeleide industry-baseline (geen shrinkage)
-- ============================================================
-- Achtergrond (filly-brein hfst 9.4, herzien):
--   Mig 0047 gebruikte arbitraire absolute drempels (score >= 80 =
--   winner, >= 50 = average). Die 80/50 waren niet afgeleid uit
--   echte benchmarks.
--
--   We classificeren nu t.o.v. een INDUSTRY-BASELINE: de score die een
--   gemiddelde campagne behaalt volgens industry-benchmarks, berekend
--   met DEZELFDE score-formule. Geen per-restaurant-aanpassing
--   (shrinkage) — dat staat op de backlog (Floris heeft daar een
--   eigen plan voor).
--
--   Mail-baseline afgeleid uit Mailchimp "Restaurant" / Campaign
--   Monitor food & beverage 2024:
--     open_rate  ~25%  → least(30, 0.25*100)   = 25 pt
--     click_rate ~1,8% → least(50, 0.018*1000) = 18 pt
--     conv_rate  ~1%   → least(20, 0.01*1000)  = 10 pt
--     baseline-score                            = 53
--
--   Classificatie t.o.v. de baseline:
--     winner        : score >= round(baseline * 1.30) = 69
--     underperformer: score <= round(baseline * 0.70) = 37
--     average       : daartussenin
--
--   Andere kanalen (social/whatsapp/gbp) krijgen voorlopig no_data:
--   hun metrics worden gevuld door Meta/TikTok/GBP-webhooks die pas
--   na de OAuth-koppelingen bestaan. Zodra die data binnenkomt voegen
--   we per-kanaal een eigen baseline + genormaliseerde formule toe
--   (reach-rate = reach/followers, etc.). Tot dan: alleen mail scoort.
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
  v_open_pts numeric;
  v_click_pts numeric;
  v_conv_pts numeric;
  -- Industry-baseline voor mail (zie header voor afleiding) + marges.
  mail_baseline constant numeric := 53;
  winner_mult constant numeric := 1.30;
  under_mult constant numeric := 0.70;
begin
  for r in
    select id, mail_delivered, mail_opened, mail_clicked, reservations_attributed
    from public.campaign_performance
    where classification is null
      and marked_outlier = false
      and created_at < now() - interval '14 days'
    limit 500
  loop
    -- Geen mail-data → no_data classification, score blijft null.
    -- (Social/GBP/WhatsApp landen hier tot hun webhook-data + baseline
    -- bestaat na de OAuth-koppelingen.)
    if coalesce(r.mail_delivered, 0) = 0 then
      update public.campaign_performance
      set classification = 'no_data',
          measurement_complete_at = now()
      where id = r.id;
      v_no_data := v_no_data + 1;
      v_processed := v_processed + 1;
      continue;
    end if;

    -- Gewogen score, ratios × multiplier, geclamped op de cap.
    v_open_pts := least(30, (coalesce(r.mail_opened, 0)::numeric / r.mail_delivered) * 100);
    v_click_pts := least(50, (coalesce(r.mail_clicked, 0)::numeric / r.mail_delivered) * 1000);
    v_conv_pts := least(20, (r.reservations_attributed::numeric / r.mail_delivered) * 1000);

    v_score := round(v_open_pts + v_click_pts + v_conv_pts);

    -- Classificatie t.o.v. de vaste industry-baseline.
    if v_score >= round(mail_baseline * winner_mult) then
      v_class := 'winner';
      v_winners := v_winners + 1;
    elsif v_score <= round(mail_baseline * under_mult) then
      v_class := 'underperformer';
      v_under := v_under + 1;
    else
      v_class := 'average';
      v_average := v_average + 1;
    end if;

    update public.campaign_performance
    set
      success_score = v_score,
      classification = v_class,
      measurement_complete_at = now()
    where id = r.id;

    v_processed := v_processed + 1;
  end loop;

  return query select v_processed, v_winners, v_average, v_under, v_no_data;
end;
$$;

comment on function public.classify_campaign_performance is
  'Scoort campagne-performance + classification zodra meet-window verstreken is (14d). Mail t.o.v. afgeleide industry-baseline (53): winner >= 69, underperformer <= 37. Andere kanalen no_data tot OAuth-data. Per-restaurant-shrinkage staat op backlog. pg_cron daily 03:17 UTC, idempotent.';
