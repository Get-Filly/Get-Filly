"use client";

import { useTranslations } from "next-intl";

import {
  HALF_HOUR_SLOTS,
  HOUR_HEADERS,
  tierBackground,
  tierTextColor,
} from "../_lib/hour-heatmap";

// ============================================================
// HourHeatmap, half-uur bezetting-heatmap
// ============================================================
// Werkt voor 1 rij (dag-view) of N rijen (week-view = 7 rijen).
//
// Layout: header met 1 label per hele uur (span 2 half-uur cellen)
// + per rij een label-cel + 22 data-cellen. Elke cel toont het
// percentage in het midden, kleur matched met maand-view tiers.

export type HourHeatmapRow = {
  // Korte labels: "MA", "Vandaag", "Vr 15 mei", etc. Komt links
  // van de rij te staan, label-kolom is 36px breed.
  label: string;
  // Optioneel: vet + brand-kleur (voor "vandaag"-markering).
  emphasis?: boolean;
  // Per half-uur bezettings-% (0-100). Lengte moet matchen met
  // HALF_HOUR_SLOTS (22 entries); anders rendert de component
  // minder cellen dan kolommen wat de grid scheef trekt.
  hours: number[];
};

type Props = {
  rows: HourHeatmapRow[];
  // Als true: wrapper neemt `flex: 1` en data-rijen verdelen de
  // beschikbare hoogte gelijk. Cellen groeien dan mee met de
  // parent-container. Geschikt voor de dashboard-calendar-card
  // waar we de hele card-hoogte willen vullen. Default false →
  // vaste cel-hoogte (compacter, voor inline-gebruik).
  fillHeight?: boolean;
  // Breedte van de label-kolom. Default 54px (genoeg voor "MA"/
  // "WO 14" etc). Voor dag-view met tafel-labels "6+ pers." past
  // niet — daar wil je 72px of zo doorgeven.
  labelColumnWidth?: string;
};

// Minimum cel-hoogte. In fillHeight-mode is dit de floor (kleine
// schermen kunnen onder de natural fit-zone gaan), in fixed-mode
// is dit de exacte hoogte.
const MIN_CELL_HEIGHT = 42;

export function HourHeatmap({
  rows,
  fillHeight = false,
  labelColumnWidth = "54px",
}: Props) {
  const t = useTranslations("dash__components_hour_heatmap");
  const gridCols = `${labelColumnWidth} repeat(${HALF_HOUR_SLOTS.length}, 1fr)`;

  // Outer-wrapper: bij fillHeight is 'ie zelf flex-1, anders auto.
  const wrapperStyle: React.CSSProperties = fillHeight
    ? {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        minHeight: 0,
      }
    : { display: "flex", flexDirection: "column", gap: 3 };

  // Data-rij-wrapper: bij fillHeight `flex: 1` zodat alle rijen
  // samen de beschikbare hoogte verdelen. minHeight: 0 zodat ze
  // ook kunnen krimpen onder hun natural-content-height.
  const dataRowStyle: React.CSSProperties = fillHeight
    ? {
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: 4,
        flex: 1,
        minHeight: 0,
      }
    : {
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: 3,
      };

  // Cel-styling: bij fillHeight pakt de cel `height: 100%` van z'n
  // grid-rij, anders vaste MIN_CELL_HEIGHT.
  const cellHeight = fillHeight ? "100%" : MIN_CELL_HEIGHT;

  return (
    <div style={wrapperStyle}>
      {/* Header-rij: lege label-cel + 11 hele-uur labels die elk
          2 half-uur cellen spannen. flex-shrink: 0 zodat 'ie altijd
          z'n natural hoogte houdt, ook in fillHeight-mode. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 3,
          marginBottom: 2,
          flexShrink: 0,
        }}
      >
        <div />
        {HOUR_HEADERS.map((h) => (
          <div
            key={h}
            style={{
              gridColumn: "span 2",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--tl)",
              textAlign: "center",
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Data-rijen. */}
      {rows.map((row, dIdx) => (
        <div key={`${dIdx}-${row.label}`} style={dataRowStyle}>
          <div
            style={{
              fontSize: 11,
              fontWeight: row.emphasis ? 700 : 600,
              color: row.emphasis ? "var(--accent)" : "var(--tl)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {row.label}
          </div>
          {row.hours.map((pct, hIdx) => (
            <div
              key={hIdx}
              title={t("cellTitle", {
                label: row.label,
                time: HALF_HOUR_SLOTS[hIdx],
                pct,
              })}
              style={{
                height: cellHeight,
                minHeight: MIN_CELL_HEIGHT,
                background: tierBackground(pct),
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                color: tierTextColor(pct),
                lineHeight: 1,
              }}
            >
              {pct}%
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
