"use client";

import { useTranslations } from "next-intl";

import {
  SERVICE_LABELS,
  tierBackground,
  tierTextColor,
  type ServiceKey,
} from "../_lib/hour-heatmap";

// ============================================================
// ServiceGrid, generieke heatmap met service-periodes als kolommen
// ============================================================
// Gebruikt door:
//   - week-view (7 dagen-rijen × N services)
//   - dag-view  (5 tafels-rijen × N services voor die dag)
//
// Kolommen worden automatisch bepaald uit de eerste rij's `cells`-
// keys (alle rijen moeten dezelfde service-keys hebben, anders krijg
// je een scheve grid). Voor dag-view tonen we alleen actieve services
// voor die specifieke dag → kolom-count varieert per dag.
//
// Cellen zijn flex-rows zodat ze meegroeien met de container-hoogte
// wanneer fillHeight=true (zelfde patroon als HourHeatmap).

export type ServiceCellMap = Partial<Record<ServiceKey, number>>;

export type ServiceGridRow = {
  // Label-cel links (bv. "MA", "WO 14", "2 pers.", "Bar").
  label: string;
  // Vet + brand-kleur (voor vandaag-markering in week-view).
  emphasis?: boolean;
  // Bezetting-% per service. Alleen aanwezige services krijgen een
  // cel; ontbrekende keys = geen cel in die kolom (lege ruimte).
  cells: ServiceCellMap;
};

type Props = {
  // Service-kolommen in vaste volgorde. Standaard alle 3 (Ontbijt /
  // Lunch / Diner), maar week- en dag-view kunnen subset doorgeven
  // wanneer een service voor de hele view inactief is (bv. geen
  // ontbijt aangeboden in de hele week → 2-koloms grid).
  serviceKeys: readonly ServiceKey[];
  rows: ServiceGridRow[];
  // Optionele sublabel per service in de header. Week-view geeft hier
  // de meest-voorkomende tijden, dag-view de tijden voor die specifieke
  // dag. Bv. "09:00 – 11:30 · 1 shift". Missing key = geen sublabel.
  serviceSublabels?: Partial<Record<ServiceKey, string>>;
  // Zelfde fillHeight-mode als HourHeatmap: rijen verdelen de
  // beschikbare hoogte. Voor card-vullende layouts in CalendarCard.
  fillHeight?: boolean;
  labelColumnWidth?: string;
};

const MIN_CELL_HEIGHT = 56;

export function ServiceGrid({
  serviceKeys,
  rows,
  serviceSublabels,
  fillHeight = false,
  labelColumnWidth = "72px",
}: Props) {
  const t = useTranslations("dash__components_service_grid");
  const gridCols = `${labelColumnWidth} repeat(${serviceKeys.length}, 1fr)`;

  const wrapperStyle: React.CSSProperties = fillHeight
    ? {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        minHeight: 0,
      }
    : { display: "flex", flexDirection: "column", gap: 4 };

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
        gap: 4,
      };

  const cellHeight = fillHeight ? "100%" : MIN_CELL_HEIGHT;
  // In fillHeight-modus verdelen de rijen (flex:1) de beschikbare hoogte.
  // Géén minHeight-vloer dan: anders worden de cellen (bv. 56px) hoger dan
  // hun krappe flex-rij (bv. 37px bij 7 week-rijen in een korte kaart) en
  // gaan ze elkaar verticaal OVERLAPPEN. Met minHeight 0 vult elke cel exact
  // z'n rij → strak uitgelijnd, geen overlap. Buiten fillHeight (natuurlijke
  // hoogte) houden we de 56px-vloer voor leesbaarheid.
  const cellMinHeight = fillHeight ? 0 : MIN_CELL_HEIGHT;

  return (
    <div style={wrapperStyle}>
      {/* Kop-rij: lege label-cel + service-namen */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 4,
          marginBottom: 4,
          flexShrink: 0,
        }}
      >
        <div />
        {serviceKeys.map((key) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--tl)",
              }}
            >
              {SERVICE_LABELS[key]}
            </div>
            {serviceSublabels?.[key] && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--tl)",
                  marginTop: 2,
                  opacity: 0.8,
                }}
              >
                {serviceSublabels[key]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Data-rijen */}
      {rows.map((row, rIdx) => (
        <div key={`${rIdx}-${row.label}`} style={dataRowStyle}>
          <div
            style={{
              fontSize: 12,
              fontWeight: row.emphasis ? 700 : 600,
              color: row.emphasis ? "var(--accent)" : "var(--tl)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {row.label}
          </div>
          {serviceKeys.map((key) => {
            const pct = row.cells[key];
            // Cel ontbreekt → grijs-gevoelige placeholder met streepje,
            // zodat de grid uitlijnt maar duidelijk is dat er geen
            // data is.
            if (pct == null) {
              return (
                <div
                  key={key}
                  style={{
                    height: cellHeight,
                    minHeight: cellMinHeight,
                    background: "var(--bg-soft, #FAF7F1)",
                    border: "1px dashed var(--border, #E5DFD0)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    color: "var(--tl)",
                    lineHeight: 1,
                  }}
                >
                  —
                </div>
              );
            }
            return (
              <div
                key={key}
                title={t("cellTooltip", {
                  label: row.label,
                  service: SERVICE_LABELS[key],
                  pct,
                })}
                style={{
                  height: cellHeight,
                  minHeight: cellMinHeight,
                  background: tierBackground(pct),
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 600,
                  color: tierTextColor(pct),
                  lineHeight: 1,
                }}
              >
                {pct}%
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
