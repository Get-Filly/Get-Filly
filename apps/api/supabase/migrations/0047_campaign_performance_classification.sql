-- ============================================================
-- Get Filly — Migratie 0047
-- Nightly success-classification voor campaign_performance
-- ============================================================
-- Achtergrond:
--   Per filly-brein hoofdstuk 9.4 + 9.6 berekenen we per campagne
--   een success_score 0-100 en classification (winner / average /
--   underperformer / no_data) zodra de meet-window verstreken is.
--   Filly's leerloop (winners → "use as inspiration", underperformers
--   → "avoid these patterns") leest deze data later in.
--
-- Strategie:
--   1. SECURITY DEFINER-functie classify_campaign_performance die
--      alle campagnes scoort waar:
--        - classification = null (nog niet gescored)
--        - created_at > 14 dagen geleden (meet-window verstreken
--          voor mail; voor IG/FB/Reels later differentieren)
--      Idempotent — als classification al gezet, skippen we.
--   2. pg_cron job die de functie elke nacht om 03:17 UTC draait
--      (zelfde tijdslot als migraties 0035 + 0043).
--
-- Score-formule (v1, mail-only):
--   open_rate    * 30  (cap 30)  +
--   click_rate   * 50  (cap 50)  +
--   conv_rate    * 20  (cap 20)  = score 0-100
-- Conv_rate = reservations_attributed / mail_delivered.
--
-- Drempels (uit filly-brain.config SUCCESS_SCORE_THRESHOLDS):
--   >= 80    winner
--   50-79    average
--   <  50    underperformer
--   0 mails  no_data
--
-- pg_cron scope-uitzondering:
--   Per project-memory feedback_getfilly_no_cron is interne cron
--   voor Filly's business-logic NIET toegestaan, maar DB-maintenance
--   wél (zelfde uitzondering als 0035 + 0043). Deze classification
--   is data-aggregatie, dus valt onder de uitzondering.
-- ============================================================

-- ============================================================
-- 1. Classification-functie
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
    if coalesce(r.mail_delivered, 0) = 0 then
      update public.campaign_performance
      set classification = 'no_data',
          measurement_complete_at = now()
      where id = r.id;
      v_no_data := v_no_data + 1;
      v_processed := v_processed + 1;
      continue;
    end if;

    -- Gewogen score berekening, alle ratios als fractie (0.0-1.0)
    -- × multiplier en geclamped op de cap.
    v_open_pts := least(30, (coalesce(r.mail_opened, 0)::numeric / r.mail_delivered) * 100);
    v_click_pts := least(50, (coalesce(r.mail_clicked, 0)::numeric / r.mail_delivered) * 1000);
    v_conv_pts := least(20, (r.reservations_attributed::numeric / r.mail_delivered) * 1000);

    v_score := round(v_open_pts + v_click_pts + v_conv_pts);

    -- Classificatie volgens filly-brain SUCCESS_SCORE_THRESHOLDS.
    if v_score >= 80 then
      v_class := 'winner';
      v_winners := v_winners + 1;
    elsif v_score >= 50 then
      v_class := 'average';
      v_average := v_average + 1;
    else
      v_class := 'underperformer';
      v_under := v_under + 1;
    end if;

    update public.campaign_performance
    set
      success_score = v_score,
      classification = v_class,
      measurement_complete_at = now()
    where id = r.id;

    v_processed := v_processed + 1;
  end loop;

  -- Return als één rij zodat de logger kan zien wat er deze run is gebeurd.
  return query select v_processed, v_winners, v_average, v_under, v_no_data;
end;
$$;

comment on function public.classify_campaign_performance is
  'Scoort campagne-performance voor classification-veld zodra meet-window verstreken is (14d). Aangeroepen door pg_cron-job daily om 03:17 UTC. Idempotent: skipt rijen met classification al gezet of marked_outlier=true.';

-- ============================================================
-- 2. pg_cron schedule
-- ============================================================
do $$
begin
  perform cron.unschedule('classify_campaign_performance');
exception
  when others then
    null;
end$$;

-- 03:17 UTC = 04:17 of 05:17 NL-tijd. Zelfde tijdslot als 0035 + 0043
-- zodat alle DB-maintenance jobs op één momentum draaien.
select cron.schedule(
  'classify_campaign_performance',
  '17 3 * * *',
  $$select public.classify_campaign_performance();$$
);
