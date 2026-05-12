"use client";

import { useState } from "react";
import type {
  ServicePeriods,
  ServicePeriodDay,
} from "../lib/api";

// ============================================================
// ServicePeriodsEditor, per-dag config voor ontbijt/lunch/diner
// ============================================================
// Herbruikbaar tussen:
//   - /onboarding stap 2 (eigenaar zet 't eerst op)
//   - /dashboard/account sectie "Service-tijden" (later aanpassen)
//
// UI: 3 tabs (Ontbijt/Lunch/Diner). Per tab een 7-dagen-tabel met
// per dag: open-toggle + start- en eind-tijd + zittings-aantal.
// "Gebruik deze tijden voor alle dagen"-knop bovenaan om snel te
// invullen wanneer er geen weekend-uitzondering is.

const SERVICE_KEYS = ["breakfast", "lunch", "dinner"] as const;
type ServiceKey = (typeof SERVICE_KEYS)[number];

const SERVICE_LABELS: Record<ServiceKey, string> = {
  breakfast: "Ontbijt",
  lunch: "Lunch",
  dinner: "Diner",
};

// Sensible defaults per service-type. Bij "service weer aanzetten
// voor een dag" gebruiken we deze als uitgangspunt zodat eigenaar
// niet vanaf 00:00 hoeft te beginnen.
const SERVICE_DEFAULTS: Record<ServiceKey, ServicePeriodDay> = {
  breakfast: { start: "09:00", end: "11:30", session_count: 1 },
  lunch: { start: "12:00", end: "15:00", session_count: 2 },
  dinner: { start: "17:30", end: "22:30", session_count: 2 },
};

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: "mon", label: "MA" },
  { key: "tue", label: "DI" },
  { key: "wed", label: "WO" },
  { key: "thu", label: "DO" },
  { key: "fri", label: "VR" },
  { key: "sat", label: "ZA" },
  { key: "sun", label: "ZO" },
];

type Props = {
  value: ServicePeriods | null;
  onChange: (next: ServicePeriods) => void;
};

export function ServicePeriodsEditor({ value, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<ServiceKey>("lunch");

  // Defensive: lege/null value krijgt een minimale shape zodat de
  // editor altijd kan renderen. Bij eerste change wordt 'm via
  // onChange teruggeschreven naar de parent.
  const periods: ServicePeriods = value ?? {
    breakfast: {},
    lunch: {},
    dinner: {},
  };

  const updateDay = (
    service: ServiceKey,
    day: string,
    next: ServicePeriodDay | null,
  ) => {
    onChange({
      ...periods,
      [service]: {
        ...(periods[service] ?? {}),
        [day]: next,
      },
    });
  };

  const activeService = periods[activeTab] ?? {};

  return (
    <div>
      {/* Tab-balk */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid var(--border, #E5DFD0)",
        }}
      >
        {SERVICE_KEYS.map((key) => {
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                padding: "8px 14px",
                border: "none",
                background: "transparent",
                borderBottom: active
                  ? "2px solid var(--brand, #1F4A2D)"
                  : "2px solid transparent",
                color: active ? "var(--brand, #1F4A2D)" : "var(--tl)",
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {SERVICE_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* Dag-rijen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {WEEKDAYS.map((day) => {
          const dayValue = activeService[day.key];
          const closed = dayValue == null;
          return (
            <div
              key={day.key}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "8px 10px",
                background: closed
                  ? "transparent"
                  : "var(--bg-soft, #FAF7F1)",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
              }}
            >
              {/* Dag-label */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: closed ? "var(--tl)" : "var(--text)",
                }}
              >
                {day.label}
              </div>

              {/* Tijden + zittingen, alleen tonen als open */}
              {closed ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    fontStyle: "italic",
                  }}
                >
                  Gesloten op deze dag
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="time"
                    value={dayValue.start}
                    onChange={(e) =>
                      updateDay(activeTab, day.key, {
                        ...dayValue,
                        start: e.target.value,
                      })
                    }
                    style={{
                      padding: "4px 6px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 4,
                      fontSize: 13,
                      width: 90,
                    }}
                  />
                  <span style={{ color: "var(--tl)" }}>tot</span>
                  <input
                    type="time"
                    value={dayValue.end}
                    onChange={(e) =>
                      updateDay(activeTab, day.key, {
                        ...dayValue,
                        end: e.target.value,
                      })
                    }
                    style={{
                      padding: "4px 6px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 4,
                      fontSize: 13,
                      width: 90,
                    }}
                  />
                  <span style={{ color: "var(--tl)", marginLeft: 8 }}>
                    Shifts:
                  </span>
                  <select
                    value={dayValue.session_count}
                    onChange={(e) =>
                      updateDay(activeTab, day.key, {
                        ...dayValue,
                        session_count: parseInt(e.target.value, 10),
                      })
                    }
                    style={{
                      padding: "3px 6px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </div>
              )}

              {/* Open/Gesloten toggle */}
              <button
                type="button"
                onClick={() => {
                  if (closed) {
                    updateDay(activeTab, day.key, {
                      ...SERVICE_DEFAULTS[activeTab],
                    });
                  } else {
                    updateDay(activeTab, day.key, null);
                  }
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid var(--border, #E5DFD0)",
                  background: closed
                    ? "var(--brand, #1F4A2D)"
                    : "transparent",
                  color: closed ? "#FFFFFF" : "var(--tl)",
                  borderRadius: 4,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {closed ? "Open" : "Sluit"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
