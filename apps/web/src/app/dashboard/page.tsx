"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KpiRow } from "./_components/kpi-row";
import { WeatherForecast } from "./_components/weather-forecast";
import { CalendarCard } from "./_components/calendar-card";
import { DetailCard } from "./_components/detail-card";
import { FillyChat } from "./_components/filly-chat";
import {
  detectLowOccupancySuggestions,
  fetchOccupancy,
  type OccupancyDay,
} from "../../lib/api";
import { Button } from "../../components/ui/button";

export type View = "dag" | "maand" | "jaar";

export default function DashboardPage() {
  const today = new Date();
  const router = useRouter();
  const [view, setView] = useState<View>("maand");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  // Alert-bar werkt op een fixed 14-dagen-window vooruit, ongeacht
  // welke maand de eigenaar in de kalender bekijkt. Eigen state
  // zodat we 'm los van het kalender-view kunnen verversen — anders
  // mist de alert-bar dagen in de volgende maand wanneer current
  // tegen het einde van de maand zit.
  const [windowOccupancy, setWindowOccupancy] = useState<OccupancyDay[]>([]);

  // Low-occupancy-detectie: state + handler.
  const [lowOccDetecting, setLowOccDetecting] = useState(false);
  const [lowOccMessage, setLowOccMessage] = useState<string | null>(null);

  // Kalender-bron: maand-bij-maand zoals de eigenaar bladert.
  useEffect(() => {
    fetchOccupancy(viewYear, viewMonth)
      .then(setOccupancy)
      .catch(() => setOccupancy([]));
  }, [viewYear, viewMonth]);

  // Alert-bar-bron: huidige maand + volgende maand parallel zodat
  // het 14-dagen-window altijd dekkend is, ook als vandaag tegen
  // het einde van de maand zit.
  useEffect(() => {
    const nextMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const nextYear =
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    Promise.all([
      fetchOccupancy(today.getFullYear(), today.getMonth()),
      fetchOccupancy(nextYear, nextMonth),
    ])
      .then(([cur, nxt]) => setWindowOccupancy([...cur, ...nxt]))
      .catch(() => setWindowOccupancy([]));
    // Bewust geen deps — bij dashboard-mount eenmalig; dagen
    // veranderen niet binnen sessie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alert-bar: dagen komende 14 dagen met bezetting onder 50%.
  const todayStr = today.toISOString().slice(0, 10);
  const fortnight = new Date(today);
  fortnight.setDate(today.getDate() + 14);
  const criticalDays = windowOccupancy.filter((d) => {
    if (d.date <= todayStr) return false;
    if (d.date > fortnight.toISOString().slice(0, 10)) return false;
    return d.occupancy_pct < 50;
  });

  const handleDetectLowOccupancy = async () => {
    setLowOccDetecting(true);
    setLowOccMessage(null);
    try {
      const result = await detectLowOccupancySuggestions();
      // Vier mogelijke uitkomsten:
      //  - generated > 0: nieuwe voorstellen → navigeer naar campagnes
      //  - generated 0 & skipped > 0: alle dagen al voorstel → toon
      //    melding maar navigeer toch zodat eigenaar de bestaande ziet
      //  - generated 0 & skipped 0 & detected > 0: alle Claude-calls
      //    faalden (zeldzaam) → tonen
      //  - detected 0: geen rustige dagen meer in window → tonen
      if (result.generated > 0) {
        setLowOccMessage(
          `${result.generated} ${result.generated === 1 ? "voorstel" : "voorstellen"} klaar! Filly stuurt je door…`,
        );
        setTimeout(() => router.push("/dashboard/campagnes"), 1200);
      } else if (result.skipped > 0) {
        setLowOccMessage(
          `Voor alle ${result.skipped} rustige dagen wachten al voorstellen op je goedkeuring.`,
        );
      } else if (result.detected === 0) {
        setLowOccMessage(
          "Geen rustige dagen meer in de komende 2 weken — top!",
        );
      } else {
        setLowOccMessage(
          "Filly kon op dit moment geen voorstellen maken. Probeer het zo opnieuw.",
        );
      }
    } catch (e) {
      setLowOccMessage(
        e instanceof Error
          ? e.message
          : "Detectie mislukt. Probeer het opnieuw.",
      );
    } finally {
      setLowOccDetecting(false);
    }
  };

  // Alert-bar gerenderd als losse component zodat we 'm zowel
  // bovenaan kunnen tonen (volle breedte zou kapot zijn met de
  // chat-sidebar) als binnen de left-col (lijnt netjes uit met
  // weersvoorspelling + kalender).
  const alertBar = criticalDays.length > 0 && (
    <div className="alert-bar" style={{ marginBottom: 16 }}>
      <span className="alert-icon">⚠️</span>
      <div style={{ flex: 1 }}>
        <strong>
          {criticalDays.length} rustige dag
          {criticalDays.length > 1 ? "en" : ""}
        </strong>{" "}
        in de komende 2 weken
        {" — "}
        {criticalDays
          .slice(0, 3)
          .map((d) => {
            const date = new Date(d.date);
            return `${date.getDate()} ${date.toLocaleString("nl-NL", { month: "short" })} (${d.occupancy_pct}%)`;
          })
          .join(", ")}
        {criticalDays.length > 3 && "…"}
        {lowOccMessage && (
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "var(--text-secondary, #52525B)",
            }}
          >
            {lowOccMessage}
          </div>
        )}
      </div>
      <Button
        size="sm"
        onClick={handleDetectLowOccupancy}
        loading={lowOccDetecting}
        style={{ flexShrink: 0 }}
        title="Filly bedenkt per dag een specifiek activatie-voorstel"
      >
        ✨ Filly maakt voorstellen
      </Button>
    </div>
  );

  return (
    <div className="page">
      <div className="dash-top">
        {alertBar}
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
