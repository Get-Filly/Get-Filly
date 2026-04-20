"use client";

import { useState } from "react";
import { KpiRow } from "./_components/kpi-row";
import { WeatherForecast } from "./_components/weather-forecast";
import { CalendarCard } from "./_components/calendar-card";
import { DetailCard } from "./_components/detail-card";
import { ChartCard } from "./_components/chart-card";
import { FillyChat } from "./_components/filly-chat";

export type View = "dag" | "maand" | "jaar";

export default function DashboardPage() {
  const today = new Date();
  const [view, setView] = useState<View>("maand");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  return (
    <div className="page">
      <div className="dash-top">
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
            />
            <DetailCard
              view={view}
              year={viewYear}
              month={viewMonth}
              selectedDay={selectedDay}
            />
          </div>
          <ChartCard
            view={view}
            year={viewYear}
            month={viewMonth}
            selectedDay={selectedDay}
          />
        </div>
        <div className="right-col">
          <FillyChat />
        </div>
      </div>
    </div>
  );
}
