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
// (komende 14 dgn resp. 6 wkn) en ze toont als 2 stroken (beide
// met een dun rood-700 accentstreepje links voor visuele
// consistentie) met daarnaast een groene knop om Filly om
// voorstellen te vragen voor die dagen.
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
  // Pending ai_suggestions + actieve campagnes worden gebruikt om
  // dagen waar al iets klaar staat uit de stroken te filteren
  // (per Floris-feedback 2026-05-21: zodra een dag een voorstel/
  // campagne heeft moet hij niet meer als 'actie' tonen, anders
  // genereer je dubbele voorstellen voor dezelfde datum).
  const [pendingSuggestions, setPendingSuggestions] = useState<AiSuggestion[]>(
    [],
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    const today = new Date();
    const nextMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const nextYear =
      today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    Promise.all([
      fetchOccupancy(today.getFullYear(), today.getMonth()),
      fetchOccupancy(nextYear, nextMonth),
      fetchRestaurant(),
      fetchSuggestions("pending"),
      fetchCampaigns(),
    ])
      .then(([cur, nxt, r, ss, cs]) => {
        setWindowOccupancy([...cur, ...nxt]);
        setRestaurant(r);
        setPendingSuggestions(ss);
        setCampaigns(cs);
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

  // ============================================================
  // Bouw een Set van YYYY-MM-DD-strings waarvoor al iets klaarstaat.
  // ============================================================
  // Bron 1: pending ai_suggestions — trigger_context.target_date is
  //         de datum waar het voorstel zich op richt (low_occupancy
  //         én special_day én chat-gegenereerd allemaal vullen 'm).
  // Bron 2: campagnes met status ≠ 'afgerond' — scheduled_for is de
  //         dag waarop het bericht uit gaat. Skip de history.
  // We gebruiken alleen de date-portie (eerste 10 tekens van ISO)
  // omdat een campagne om 17:00 nog steeds "die dag bezet".
  const coveredDates = useMemo(() => {
    const dates = new Set<string>();
    for (const s of pendingSuggestions) {
      const ctx = s.trigger_context as { target_date?: string } | null;
      if (ctx?.target_date) dates.add(ctx.target_date);
    }
    for (const c of campaigns) {
      if (c.status === "afgerond") continue;
      if (c.scheduled_for) {
        // Slice op 10 tekens = YYYY-MM-DD. Werkt voor zowel ISO met
        // Z-suffix als met tijdzone-offset.
        dates.add(c.scheduled_for.slice(0, 10));
      }
    }
    return dates;
  }, [pendingSuggestions, campaigns]);

  // Rode strook: bezetting onder drempel + restaurant is die dag open
  // + er staat nog géén voorstel/campagne op die datum klaar.
  const criticalDays = windowDays.filter((d) => {
    if (d.occupancy_pct >= occupancyThreshold) return false;
    if (!isOpenOn(restaurant, d.date)) return false;
    if (coveredDates.has(d.date)) return false;
    return true;
  });

  // Speciale-dagen-strook: filteren géén sluitingsdagen — een
  // feestdag op een normaal-dichte dag is juist een kans om open
  // te gaan / op te spelen. Wel filteren we dagen waarvoor al
  // iets klaarstaat (zelfde logica als rustige-dagen-strook).
  const upcomingSpecial: SpecialDay[] = getUpcomingSpecialDays(
    today,
    SPECIAL_DAYS_WEEKS_AHEAD,
  ).filter((s) => !coveredDates.has(s.date));

  const hasAnyAction =
    criticalDays.length > 0 || upcomingSpecial.length > 0;
  if (!hasAnyAction) return null;

  // Strook-styling: witte bg, dunne 4px rood-700 kleurstreep links,
  // zwarte tekst. Beide stroken (rustige + speciale dagen) delen
  // dezelfde stijl voor visuele consistentie — niet rood/geel
  // afwisselen wat per 2026-05-21 Floris-feedback verwarrend voelde.
  const stripBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "var(--color-white, #FFFFFF)",
    border: "1px solid var(--border, #E5DFD0)",
    color: "var(--text, #18181B)",
    borderRadius: "var(--rs, 8px)",
    fontSize: 13,
    lineHeight: 1.4,
    boxShadow: "inset 4px 0 0 0 #B91C1C", // rood-700, dunne accentstreep
  };

  const occupancyStrip = criticalDays.length > 0 && (
    <div style={stripBase}>
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

  const specialStrip = upcomingSpecial.length > 0 && (
    <div style={stripBase}>
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
          {occupancyStrip}
          {specialStrip}
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
        {occupancyStrip}
        {specialStrip}
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
