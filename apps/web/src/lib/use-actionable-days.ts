"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchOccupancy,
  fetchQuietMoments,
  fetchRestaurant,
  fetchSuggestions,
  type AiSuggestion,
  type Campaign,
  type OccupancyDay,
  type QuietMoment,
  type Restaurant,
} from "./api";
import { getUpcomingSpecialDays, type SpecialDay } from "./special-days";
import { isOpenOn } from "./occupancy-window";
import {
  buildDayBusyness,
  specialDayMap,
  occupancyMap,
  addDays,
  isoOf,
} from "@/app/[locale]/dashboard/_lib/busyness";

// ============================================================
// useActionableDays — rustige + speciale dagen voor Filly-flows
// ============================================================
//
// Levert de dagen waarvoor een actie zinvol is, zodat de geleide
// chat-flow (FillyGuidedFlow) dezelfde lijst kan tonen als de
// "Vraag Filly om voorstellen"-stroken op het dashboard:
//   - lowOccupancyDays : komende 14 dgn onder de eigenaar-drempel,
//                        restaurant die dag open, nog niet afgedekt.
//   - specialDays      : komende 6 wkn feestdagen, nog niet afgedekt.
//
// De rekenlogica spiegelt UpcomingActionsBlock bewust 1-op-1. Bij een
// volgende ronde kunnen beide deze hook delen (dedupe-kans, zie
// BACKLOG); nu houden we de werkende block ongemoeid en lezen we hier
// alleen dezelfde bronnen + helpers opnieuw.

const SPECIAL_DAYS_WEEKS_AHEAD = 6;
const LOW_OCCUPANCY_WINDOW_DAYS = 14;

export type ActionableDays = {
  lowOccupancyDays: OccupancyDay[];
  specialDays: SpecialDay[];
  occupancyThreshold: number;
  loading: boolean;
  // Komende open dagen (max 14), ongeacht bezetting. Gebruikt door de
  // geleide flow als er GEEN echte bezettingsdata is: dan tonen we eerlijk
  // "elke open dag is rustig" met een paar van deze dagen i.p.v. seeded.
  upcomingOpenDays: string[];
  // Is er überhaupt echte occupancy_days-data in het venster?
  hasOccupancyData: boolean;
  // Hoeveel dagen ANDERS een actie zouden vragen maar al afgedekt zijn
  // (voorstel/campagne). Voor de "onder controle"-tekst in
  // UpcomingActionsBlock — onderscheidt "alles afgedekt" van "niets aan
  // de hand".
  coveredLowOccupancyCount: number;
  coveredSpecialCount: number;
};

export function useActionableDays(): ActionableDays {
  const [windowOccupancy, setWindowOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<AiSuggestion[]>(
    [],
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [quiet, setQuiet] = useState<{
    hasSource: boolean;
    moments: QuietMoment[];
  }>({ hasSource: false, moments: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const nextMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const nextYear =
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    let cancelled = false;
    Promise.all([
      fetchOccupancy(today.getFullYear(), today.getMonth()),
      fetchOccupancy(nextYear, nextMonth),
      fetchRestaurant(),
      fetchSuggestions("pending").catch(() => [] as AiSuggestion[]),
      fetchCampaigns().catch(() => [] as Campaign[]),
      fetchQuietMoments().catch(() => ({
        hasSource: false,
        moments: [] as QuietMoment[],
      })),
    ])
      .then(([cur, nxt, r, ss, cs, qm]) => {
        if (cancelled) return;
        setWindowOccupancy([...cur, ...nxt]);
        setRestaurant(r);
        setPendingSuggestions(ss);
        setCampaigns(cs);
        setQuiet(qm);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setWindowOccupancy([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => new Date(), []);
  const occupancyThreshold = restaurant?.low_occupancy_threshold ?? 50;

  // Dagen waarvoor al een voorstel of (niet-afgeronde) campagne klaar
  // staat — die filteren we uit zodat we geen dubbele acties tonen.
  const coveredDates = useMemo(() => {
    const dates = new Set<string>();
    for (const s of pendingSuggestions) {
      const ctx = s.trigger_context as { target_date?: string } | null;
      if (ctx?.target_date) dates.add(ctx.target_date);
    }
    for (const c of campaigns) {
      if (c.status === "afgerond") continue;
      if (c.scheduled_for) dates.add(c.scheduled_for.slice(0, 10));
    }
    return dates;
  }, [pendingSuggestions, campaigns]);

  // Rustige dagen = het NIEUWE busyness-model (zelfde bron als de dashboard-
  // grafiek): per dag in het venster het Google-patroon → isQuiet (relatieve
  // drukte onder de eigenaar-drempel + open die dag). Zo tonen de chat en de
  // grafiek exact dezelfde rustige momenten. (Verving de ruwe occupancy_days-
  // detectie + seeded fallback, 2026-07-14.)
  const realMap = useMemo(() => occupancyMap(windowOccupancy), [windowOccupancy]);
  const { lowOccupancyDays, coveredLowOccupancyCount } = useMemo(() => {
    const mk = (date: string, pct: number): OccupancyDay => ({
      date,
      occupancy_pct: pct,
      estimated_guests: 0,
      estimated_revenue_cents: 0,
    });

    // Voorkeur: het echte model (rustige momenten uit de backend, per dagdeel).
    // De chat werkt op dagniveau, dus per unieke datum één blokje; het dagdeel
    // zit in de detectie en de dashboard-grafiek. Zelfde bron als beide.
    if (quiet.hasSource) {
      const byDate = new Map<string, number>();
      for (const m of quiet.moments) {
        if (!byDate.has(m.date)) byDate.set(m.date, m.expectedPct);
      }
      const days: OccupancyDay[] = [];
      let covered = 0;
      for (const [date, pct] of byDate) {
        if (coveredDates.has(date)) {
          covered++;
          continue;
        }
        days.push(mk(date, pct));
      }
      days.sort((a, b) => (a.date < b.date ? -1 : 1));
      return { lowOccupancyDays: days, coveredLowOccupancyCount: covered };
    }

    // Terugval (geen echt patroon): het oude busyness-model op seed + occupancy.
    const todayIso = isoOf(today);
    const specials = specialDayMap([
      today.getFullYear(),
      today.getFullYear() + 1,
    ]);
    const quietDays: OccupancyDay[] = [];
    let covered = 0;
    for (let i = 1; i <= LOW_OCCUPANCY_WINDOW_DAYS; i++) {
      const b = buildDayBusyness(
        addDays(today, i),
        realMap,
        restaurant,
        occupancyThreshold,
        todayIso,
        specials,
      );
      if (!b.isQuiet) continue; // isQuiet checkt al drempel + open
      if (coveredDates.has(b.iso)) {
        covered++;
        continue;
      }
      quietDays.push(mk(b.iso, b.displayPct));
    }
    return { lowOccupancyDays: quietDays, coveredLowOccupancyCount: covered };
  }, [quiet, realMap, today, occupancyThreshold, restaurant, coveredDates]);

  // Komende open dagen (los van bezetting): de eerlijke "elke open dag is
  // rustig"-lijst voor de flow wanneer er geen occupancy_days zijn.
  const upcomingOpenDays = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i <= LOW_OCCUPANCY_WINDOW_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (isOpenOn(restaurant, iso) && !coveredDates.has(iso)) out.push(iso);
    }
    return out;
  }, [today, restaurant, coveredDates]);

  // We hebben altijd een drukte-signaal (het Google-patroon uit busyness.ts),
  // dus de flow toont de rustige momenten uit dat model i.p.v. de oude
  // "geen reserveringen"-terugval.
  const hasOccupancyData = true;

  const { specialDays, coveredSpecialCount } = useMemo(() => {
    const all = getUpcomingSpecialDays(today, SPECIAL_DAYS_WEEKS_AHEAD);
    const open = all.filter((s) => !coveredDates.has(s.date));
    return { specialDays: open, coveredSpecialCount: all.length - open.length };
  }, [today, coveredDates]);

  return {
    lowOccupancyDays,
    specialDays,
    occupancyThreshold,
    loading,
    coveredLowOccupancyCount,
    coveredSpecialCount,
    upcomingOpenDays,
    hasOccupancyData,
  };
}
