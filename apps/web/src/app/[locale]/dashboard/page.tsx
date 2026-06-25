"use client";

import { useEffect, useState } from "react";
import { KpiRow } from "./_components/kpi-row";
import { CalendarCard } from "./_components/calendar-card";
import { FillyChat } from "./_components/filly-chat";
import { UpcomingActionsBlock } from "./_components/upcoming-actions-block";
import {
  fetchOccupancy,
  fetchRestaurant,
  type OccupancyDay,
  type Restaurant,
} from "@/lib/api";

export type View = "dag" | "week" | "maand" | "jaar";

export default function DashboardPage() {
  const today = new Date();
  const [view, setView] = useState<View>("maand");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  // Restaurant-config nodig voor de kalender (sluitingsdagen +
  // capaciteit). De stroken-block fetcht z'n eigen restaurant-data.
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  // Kalender-bron: maand-bij-maand zoals de eigenaar bladert.
  // Sequence-guard: snel bladeren mag geen trage oude maand-response
  // over een nieuwere laten vallen.
  useEffect(() => {
    let cancelled = false;
    fetchOccupancy(viewYear, viewMonth)
      .then((o) => {
        if (!cancelled) setOccupancy(o);
      })
      .catch(() => {
        if (!cancelled) setOccupancy([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth]);

  // Restaurant-config voor calendar-render. Eénmalig bij mount.
  useEffect(() => {
    fetchRestaurant()
      .then(setRestaurant)
      .catch(() => setRestaurant(null));
  }, []);

  return (
    <div className="page">
      <div className="dash-top">
        <UpcomingActionsBlock layout="grid-4col" />
        <KpiRow />
      </div>
      <div className="dash-body">
        <div className="left-col">
          {/* Weersvoorspelling bewust niet op het dashboard: ondernemers
              weten zelf wel of het gaat regenen. Filly krijgt het weer
              nog wél mee in zijn chat-context (RestaurantContextService
              op de api), zodat advies blijft kloppen. */}
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
            restaurant={restaurant}
          />
        </div>
        <div className="right-col">
          <FillyChat />
        </div>
      </div>
    </div>
  );
}
