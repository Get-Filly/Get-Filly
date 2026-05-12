"use client";

import { useEffect, useState } from "react";
import { KpiRow } from "./_components/kpi-row";
import { CalendarCard } from "./_components/calendar-card";
import { FillyChat } from "./_components/filly-chat";
import { FillySuggestionsPopover } from "./_components/filly-suggestions-popover";
import {
  fetchOccupancy,
  fetchRestaurant,
  type OccupancyDay,
  type Restaurant,
} from "../../lib/api";
import {
  getUpcomingSpecialDays,
  type SpecialDay,
} from "../../lib/special-days";
import {
  buildWindowOccupancy,
  isOpenOn,
} from "../../lib/occupancy-window";

export type View = "dag" | "week" | "maand" | "jaar";

// Hoeveel weken vooruit speciale dagen tonen. 6 wkn = genoeg om
// Moederdag/Vaderdag-campagnes ruim voor te bereiden, niet zo ver
// dat de strook eindeloos vol komt te zitten.
const SPECIAL_DAYS_WEEKS_AHEAD = 6;
// Hoeveel dagen vooruit voor de rode "rustige dagen"-strook.
const LOW_OCCUPANCY_WINDOW_DAYS = 14;

function formatDayNl(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export default function DashboardPage() {
  const today = new Date();
  const [view, setView] = useState<View>("maand");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  // Stroken-data werkt op een fixed 14-dagen-window vooruit, ongeacht
  // welke maand de eigenaar in de kalender bekijkt. Eigen state
  // zodat we 'm los van het kalender-view kunnen verversen, anders
  // missen we dagen in de volgende maand wanneer current tegen het
  // einde van de maand zit.
  const [windowOccupancy, setWindowOccupancy] = useState<OccupancyDay[]>([]);
  // Restaurant-config voor de bezetting-drempel + sluitingsdagen.
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  // Kalender-bron: maand-bij-maand zoals de eigenaar bladert.
  useEffect(() => {
    fetchOccupancy(viewYear, viewMonth)
      .then(setOccupancy)
      .catch(() => setOccupancy([]));
  }, [viewYear, viewMonth]);

  // Stroken-bron: huidige maand + volgende maand parallel zodat
  // het 14-dagen-window altijd dekkend is, ook als vandaag tegen
  // het einde van de maand zit. Plus restaurant-config voor drempel.
  useEffect(() => {
    const nextMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const nextYear =
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    Promise.all([
      fetchOccupancy(today.getFullYear(), today.getMonth()),
      fetchOccupancy(nextYear, nextMonth),
      fetchRestaurant(),
    ])
      .then(([cur, nxt, r]) => {
        setWindowOccupancy([...cur, ...nxt]);
        setRestaurant(r);
      })
      .catch(() => setWindowOccupancy([]));
    // Bewust geen deps, bij dashboard-mount eenmalig; dagen
    // veranderen niet binnen sessie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rode strook: rustige dagen komende 14 dagen.
  // - Drempel uit restaurant.low_occupancy_threshold (default 50)
  // - Skip sluitingsdagen (closed_dates + vaste wekelijkse sluiting)
  // - Mock-fallback via buildWindowOccupancy zodat de strook
  //   consistent is met de kalender óók als occupancy_days nog
  //   niet gevuld is (nieuwe accounts / demo).
  const occupancyThreshold = restaurant?.low_occupancy_threshold ?? 50;
  const windowDays = buildWindowOccupancy(
    windowOccupancy,
    today,
    LOW_OCCUPANCY_WINDOW_DAYS,
  );

  const criticalDays = windowDays.filter((d) => {
    if (d.occupancy_pct >= occupancyThreshold) return false;
    if (!isOpenOn(restaurant, d.date)) return false;
    return true;
  });

  // Gele strook: speciale dagen komende 6 weken. Filtert sluitingsdagen
  // niet — een feestdag op een wekelijkse sluitingsdag is juist
  // interessant (extra reden om open te zijn / op te speken).
  const upcomingSpecial: SpecialDay[] = getUpcomingSpecialDays(
    today,
    SPECIAL_DAYS_WEEKS_AHEAD,
  );

  // Wrapper alleen tonen als er iets is om te laten zien, anders
  // is 't visuele ruis op een leeg dashboard.
  const hasAnyAction =
    criticalDays.length > 0 || upcomingSpecial.length > 0;

  // Strook-styling: rood-soft voor critical (urgentie), amber-soft
  // voor special (kans). Inline-styling want éénmalig op deze plek.
  const redStrip = criticalDays.length > 0 && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        background: "var(--color-danger-soft, #FEE2E2)",
        border: "1px solid #FCA5A5",
        color: "#7F1D1D",
        borderRadius: "var(--rs, 8px)",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>
          {criticalDays.length} rustige dag
          {criticalDays.length > 1 ? "en" : ""}
        </strong>{" "}
        komende 2 weken:{" "}
        {criticalDays
          .slice(0, 5)
          .map((d) => `${formatDayNl(d.date)} (${d.occupancy_pct}%)`)
          .join(", ")}
        {criticalDays.length > 5 && `, +${criticalDays.length - 5} meer`}
      </div>
    </div>
  );

  const yellowStrip = upcomingSpecial.length > 0 && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        background: "#FEF3C7",
        border: "1px solid #FCD34D",
        color: "#78350F",
        borderRadius: "var(--rs, 8px)",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>🎉</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>
          {upcomingSpecial.length} speciale dag
          {upcomingSpecial.length > 1 ? "en" : ""}
        </strong>{" "}
        komende 6 weken:{" "}
        {upcomingSpecial
          .slice(0, 5)
          .map((s) => `${s.name} (${formatDayNl(s.date)})`)
          .join(", ")}
        {upcomingSpecial.length > 5 &&
          `, +${upcomingSpecial.length - 5} meer`}
      </div>
    </div>
  );

  // Stroken-blok + groene knop rechts. Layout via CSS-grid met
  // 5 even brede kolommen die exact matchen met de KPI-rij eronder:
  //   [ rode strook (span 4) ............ ] [ groene knop ]
  //   [ gele strook (span 4) ............ ] [   (vol hoog) ]
  // De groene knop is een card-mode tile die span 2 rijen pakt,
  // even breed als één KPI-blok.
  const actionBlock = hasAnyAction && (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "var(--space-4)",
        marginBottom: "var(--space-4)",
      }}
    >
      <div
        style={{
          gridColumn: "1 / span 4",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {redStrip}
        {yellowStrip}
      </div>
      <div style={{ gridColumn: "5 / span 1", minWidth: 0 }}>
        <FillySuggestionsPopover
          lowOccupancyDays={criticalDays}
          specialDays={upcomingSpecial}
          occupancyThreshold={occupancyThreshold}
          triggerMode="card"
        />
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="dash-top">
        {actionBlock}
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
          />
        </div>
        <div className="right-col">
          <FillyChat />
        </div>
      </div>
    </div>
  );
}
