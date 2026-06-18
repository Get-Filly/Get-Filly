"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchOccupancy,
  fetchRestaurant,
  fetchSuggestions,
  type AiSuggestion,
  type Campaign,
  type OccupancyDay,
  type Restaurant,
} from "./api";
import { getUpcomingSpecialDays, type SpecialDay } from "./special-days";
import { buildWindowOccupancy, isOpenOn } from "./occupancy-window";

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
    ])
      .then(([cur, nxt, r, ss, cs]) => {
        if (cancelled) return;
        setWindowOccupancy([...cur, ...nxt]);
        setRestaurant(r);
        setPendingSuggestions(ss);
        setCampaigns(cs);
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

  // Rustige dagen binnen het window die open zijn. Splits in "open"
  // (nog actie nodig) en "afgedekt" (al voorstel/campagne) in één pass.
  const { lowOccupancyDays, coveredLowOccupancyCount } = useMemo(() => {
    // seedMissing=false: alleen ECHTE lage-bezettingsdagen, geen seeded
    // nep-data (Floris-feedback 2026-06-13). Zonder occupancy_days is dit
    // dus leeg; de flow valt dan terug op upcomingOpenDays.
    const windowDays = buildWindowOccupancy(
      windowOccupancy,
      today,
      LOW_OCCUPANCY_WINDOW_DAYS,
      false,
    ).filter(
      (d) => d.occupancy_pct < occupancyThreshold && isOpenOn(restaurant, d.date),
    );
    const open = windowDays.filter((d) => !coveredDates.has(d.date));
    return {
      lowOccupancyDays: open,
      coveredLowOccupancyCount: windowDays.length - open.length,
    };
  }, [windowOccupancy, today, occupancyThreshold, restaurant, coveredDates]);

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

  const hasOccupancyData = windowOccupancy.length > 0;

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
