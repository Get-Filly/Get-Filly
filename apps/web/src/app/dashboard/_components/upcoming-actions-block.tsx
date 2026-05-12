"use client";

import { useEffect, useState } from "react";
import {
  fetchOccupancy,
  fetchRestaurant,
  type OccupancyDay,
  type Restaurant,
} from "../../../lib/api";
import {
  getUpcomingSpecialDays,
  type SpecialDay,
} from "../../../lib/special-days";
import {
  buildWindowOccupancy,
  isOpenOn,
} from "../../../lib/occupancy-window";
import { FillySuggestionsPopover } from "./filly-suggestions-popover";

// ============================================================
// <UpcomingActionsBlock>, alert-strip + "Vraag Filly om voorstellen"
// ============================================================
//
// Zelfstandige block die rustige dagen + speciale dagen ophaalt
// (komende 14 dgn resp. 6 wkn) en ze toont als 2 stroken (rood +
// geel) met daarnaast een groene knop om Filly om voorstellen te
// vragen voor die dagen.
//
// Gedeeld door:
//   - dashboard/page.tsx (layout="grid-4col", aligned met KPI-rij)
//   - dashboard/campagnes/page.tsx (layout="flex", strips groei +
//     knop natuurlijke breedte)
//
// Returnt null wanneer er niks te tonen is (geen rustige + geen
// speciale dagen), zodat het component letterlijk "verdwijnt" op
// een rustig dashboard zonder lege ruimte achter te laten.

const SPECIAL_DAYS_WEEKS_AHEAD = 6;
const LOW_OCCUPANCY_WINDOW_DAYS = 14;

function formatDayNl(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

type Layout = "grid-4col" | "flex";

type Props = {
  layout?: Layout;
};

export function UpcomingActionsBlock({ layout = "flex" }: Props) {
  // Stroken-bron: huidige + volgende maand parallel, zodat een
  // 14-daagse window altijd dekkend is ook tegen het einde van de
  // maand. Eénmalig bij mount; data verandert niet binnen sessie.
  const [windowOccupancy, setWindowOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    const today = new Date();
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
  }, []);

  const today = new Date();
  const occupancyThreshold = restaurant?.low_occupancy_threshold ?? 50;
  const windowDays = buildWindowOccupancy(
    windowOccupancy,
    today,
    LOW_OCCUPANCY_WINDOW_DAYS,
  );

  // Rode strook: bezetting onder drempel + restaurant is die dag open.
  const criticalDays = windowDays.filter((d) => {
    if (d.occupancy_pct >= occupancyThreshold) return false;
    if (!isOpenOn(restaurant, d.date)) return false;
    return true;
  });

  // Gele strook: speciale dagen filteren géén sluitingsdagen — een
  // feestdag op een normaal-dichte dag is juist een kans om open
  // te gaan / op te spelen.
  const upcomingSpecial: SpecialDay[] = getUpcomingSpecialDays(
    today,
    SPECIAL_DAYS_WEEKS_AHEAD,
  );

  const hasAnyAction =
    criticalDays.length > 0 || upcomingSpecial.length > 0;
  if (!hasAnyAction) return null;

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

  // grid-4col: dashboard-mode, 4 even cols zodat strips/knop precies
  // uitlijnen met de KPI-rij eronder (3 cols strips + 1 col knop).
  if (layout === "grid-4col") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        <div
          style={{
            gridColumn: "1 / span 3",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {redStrip}
          {yellowStrip}
        </div>
        <div style={{ gridColumn: "4 / span 1", minWidth: 0 }}>
          <FillySuggestionsPopover
            lowOccupancyDays={criticalDays}
            specialDays={upcomingSpecial}
            occupancyThreshold={occupancyThreshold}
            triggerMode="card"
          />
        </div>
      </div>
    );
  }

  // flex-mode (default): strips groei, knop pakt z'n natuurlijke
  // breedte. Voor pagina's zonder vaste kolom-grid (zoals /campagnes).
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {redStrip}
        {yellowStrip}
      </div>
      <div style={{ flexShrink: 0, minWidth: 200, display: "flex" }}>
        <FillySuggestionsPopover
          lowOccupancyDays={criticalDays}
          specialDays={upcomingSpecial}
          occupancyThreshold={occupancyThreshold}
          triggerMode="card"
        />
      </div>
    </div>
  );
}
