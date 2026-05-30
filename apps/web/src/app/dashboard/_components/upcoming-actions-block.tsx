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
// Zelfstandige block die rustige dagen (komende 14 dgn) + speciale
// dagen (komende 6 wkn) toont als 2 ALTIJD-zichtbare stroken, met
// daarnaast een groene knop om Filly om voorstellen te vragen.
//
// Elke strook heeft z'n eigen status-kleur (per Floris-feedback
// 2026-05-29, gescheiden i.p.v. één gecombineerde strook):
//   - ROOD accent  = er staan nog open dagen die actie vragen
//   - GROEN accent = onder controle (alle dagen afgedekt met een
//     voorstel/campagne, óf er waren simpelweg geen zulke dagen)
//
// De block verdwijnt dus NIET meer op een rustig dashboard: de
// eigenaar ziet altijd in één oogopslag de status van beide
// categorieën (rustige bezetting + komende speciale dagen).
//
// Gedeeld door:
//   - dashboard/page.tsx (layout="grid-4col", aligned met KPI-rij)
//   - dashboard/campagnes/page.tsx (layout="flex", strips groei +
//     knop natuurlijke breedte)

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
  const allSpecial: SpecialDay[] = getUpcomingSpecialDays(
    today,
    SPECIAL_DAYS_WEEKS_AHEAD,
  );
  const upcomingSpecial = allSpecial.filter((s) => !coveredDates.has(s.date));

  // Per strook tellen we hoeveel dagen ANDERS een actie zouden tonen,
  // maar al een voorstel of campagne hebben. Dat bepaalt de groene
  // tekst: "alles afgedekt met campagnes" vs "er was simpelweg niks".
  const coveredCritical = windowDays.filter(
    (d) =>
      d.occupancy_pct < occupancyThreshold &&
      isOpenOn(restaurant, d.date) &&
      coveredDates.has(d.date),
  ).length;
  const coveredSpecial = allSpecial.length - upcomingSpecial.length;

  // Strook-styling: witte bg, dunne 4px kleurstreep links, zwarte tekst.
  // De accentkleur verschilt per status: rood-700 = actie nodig,
  // British-Racing-Green = onder controle. accentStrip(kleur) bouwt de
  // juiste style zodat beide stroken dezelfde basis delen.
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
  };
  const RED = "#B91C1C"; // rood-700 — actie nodig
  const GREEN = "#1F4A2D"; // British Racing Green — onder controle
  const accentStrip = (color: string): React.CSSProperties => ({
    ...stripBase,
    boxShadow: `inset 4px 0 0 0 ${color}`,
  });

  // Rustige-dagen-strook: ALTIJD zichtbaar. Rood als er nog open rustige
  // dagen zijn, groen als alles onder controle is. De groene tekst
  // onderscheidt "alle afgedekt met campagnes" van "simpelweg geen
  // rustige dagen".
  const occupancyStrip = (
    <div style={accentStrip(criticalDays.length > 0 ? RED : GREEN)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {criticalDays.length > 0 ? (
          <>
            <strong>
              {criticalDays.length} rustige dag
              {criticalDays.length > 1 ? "en" : ""}
            </strong>{" "}
            komende 2 weken:{" "}
            {criticalDays
              .slice(0, 5)
              .map((d) => `${formatDayNl(d.date)} (${d.occupancy_pct}%)`)
              .join(", ")}
            {criticalDays.length > 5 &&
              `, +${criticalDays.length - 5} meer`}
          </>
        ) : coveredCritical > 0 ? (
          <>
            <strong>Rustige dagen afgedekt</strong> — alle{" "}
            {coveredCritical} rustige dag
            {coveredCritical > 1 ? "en" : ""} komende 2 weken
            {coveredCritical > 1 ? " hebben" : " heeft"} al een voorstel
            of campagne.
          </>
        ) : (
          <>
            <strong>Geen rustige dagen</strong> — je bezetting komende 2
            weken ziet er goed uit.
          </>
        )}
      </div>
    </div>
  );

  // Speciale-dagen-strook: ALTIJD zichtbaar. Zelfde rood/groen-logica
  // voor de komende 6 weken.
  const specialStrip = (
    <div style={accentStrip(upcomingSpecial.length > 0 ? RED : GREEN)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {upcomingSpecial.length > 0 ? (
          <>
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
          </>
        ) : coveredSpecial > 0 ? (
          <>
            <strong>Speciale dagen afgedekt</strong> — alle{" "}
            {coveredSpecial} speciale dag
            {coveredSpecial > 1 ? "en" : ""} komende 6 weken
            {coveredSpecial > 1 ? " hebben" : " heeft"} al een voorstel
            of campagne.
          </>
        ) : (
          <>
            <strong>Geen speciale dagen</strong> — komende 6 weken staan
            er geen feest- of themadagen op de kalender.
          </>
        )}
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
