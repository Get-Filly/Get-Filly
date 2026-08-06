-- 0069_quiet_moments_window.sql
-- Tijdvenster waarbinnen Filly rustige-momenten-voorstellen mag doen.
-- De eigenaar kan zo de voorstellen afbakenen (bv. alleen 11:00–18:00),
-- naast het aantal (quiet_moments_per_week, mig 0065).
--
-- Beide null = geen beperking = de hele open dag (huidige gedrag). Uren als
-- smallint 0–24 (end is exclusief-achtig: "tot 18:00"). Een dagdeel telt mee
-- als het ≥ min-dekking open uren binnen dit venster heeft (in de code).
alter table public.businesses
  add column if not exists quiet_window_start_hour smallint,
  add column if not exists quiet_window_end_hour   smallint;

-- Integriteit: óf allebei leeg, óf een geldig venster met start < end.
alter table public.businesses
  add constraint businesses_quiet_window_chk check (
    (quiet_window_start_hour is null and quiet_window_end_hour is null)
    or (
      quiet_window_start_hour >= 0
      and quiet_window_end_hour <= 24
      and quiet_window_start_hour < quiet_window_end_hour
    )
  );

comment on column public.businesses.quiet_window_start_hour is
  'Begin-uur (0–23) van het venster waarbinnen rustige-momenten-voorstellen mogen vallen. NULL (samen met end) = geen beperking.';
comment on column public.businesses.quiet_window_end_hour is
  'Eind-uur (1–24, exclusief) van het venster voor rustige-momenten-voorstellen. NULL = geen beperking.';
