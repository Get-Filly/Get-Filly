"use client";

import { useEffect, useState } from "react";
import { KpiRow } from "./_components/kpi-row";
import { WeatherForecast } from "./_components/weather-forecast";
import { CalendarCard } from "./_components/calendar-card";
import { DetailCard } from "./_components/detail-card";
import { FillyChat } from "./_components/filly-chat";
import { OnboardingChecklist } from "./_components/onboarding-checklist";
import { fetchOccupancy, type OccupancyDay } from "../../lib/api";

export type View = "dag" | "maand" | "jaar";

export default function DashboardPage() {
  const today = new Date();
  const [view, setView] = useState<View>("maand");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);

  // Eén bron voor kalender en alert-bar.
  useEffect(() => {
    fetchOccupancy(viewYear, viewMonth)
      .then(setOccupancy)
      .catch(() => setOccupancy([]));
  }, [viewYear, viewMonth]);

  // Alert-bar: dagen komende 14 dagen met bezetting onder 50%
  const todayStr = today.toISOString().slice(0, 10);
  const fortnight = new Date(today);
  fortnight.setDate(today.getDate() + 14);
  const criticalDays = occupancy.filter((d) => {
    if (d.date <= todayStr) return false;
    if (d.date > fortnight.toISOString().slice(0, 10)) return false;
    return d.occupancy_pct < 50;
  });

  return (
    <div className="page">
      <div className="dash-top">
        {/* Onboarding-checklist staat bovenaan zolang het restaurant
            nog niet alle setup-stappen heeft afgevinkt. Verbergt zich
            automatisch zodra alles op ✓ staat. */}
        <OnboardingChecklist />
        {criticalDays.length > 0 && (
          <div className="alert-bar">
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>{criticalDays.length} rustige dag{criticalDays.length > 1 ? "en" : ""}</strong> in de komende 2 weken
              {" — "}
              {criticalDays
                .slice(0, 3)
                .map((d) => {
                  const date = new Date(d.date);
                  return `${date.getDate()} ${date.toLocaleString("nl-NL", { month: "short" })} (${d.occupancy_pct}%)`;
                })
                .join(", ")}
              {criticalDays.length > 3 && "…"} — laat Filly voorstellen doen.
            </div>
          </div>
        )}
        <KpiRow />
      </div>
      <div className="dash-body">
        <div className="left-col">
          <WeatherForecast />
          <div className="cal-detail-row">
            <CalendarCard
              view={view}
              setView={setView}
              viewYear={viewYear}
              setViewYear={setViewYear}
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              occupancy={occupancy}
            />
            <DetailCard
              view={view}
              year={viewYear}
              month={viewMonth}
              selectedDay={selectedDay}
            />
          </div>
        </div>
        <div className="right-col">
          <FillyChat />
        </div>
      </div>
    </div>
  );
}
