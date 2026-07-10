"use client";

import type { Restaurant } from "../lib/api";

// ============================================================
// OpeningHoursEditor — openingstijden PER DAG (open–sluit)
// ============================================================
// Vervangt de per-shift service-tijden voor het dashboard: één open- en
// sluittijd per weekdag. Het dashboard-drukte-blok koppelt z'n x-as
// hieraan (opening_hours). Een dag kan gesloten zijn (waarde null).

type OpeningHours = NonNullable<Restaurant["opening_hours"]>;
type DayHours = { open: string; close: string };

const DEFAULT: DayHours = { open: "09:00", close: "22:00" };

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
  value: Restaurant["opening_hours"];
  onChange: (next: OpeningHours) => void;
};

export function OpeningHoursEditor({ value, onChange }: Props) {
  const hours: OpeningHours = value ?? {};

  const updateDay = (day: string, next: DayHours | null) => {
    onChange({ ...hours, [day]: next });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const first = hours["mon"] ?? DEFAULT;
          const next: OpeningHours = {};
          for (const d of WEEKDAYS) next[d.key] = { ...first };
          onChange(next);
        }}
        style={{
          marginBottom: 10,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 500,
          border: "1px solid var(--border, #E5DFD0)",
          background: "transparent",
          color: "var(--tl)",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Gebruik maandag voor alle dagen
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {WEEKDAYS.map((day) => {
          const dv = hours[day.key];
          const closed = dv === null;
          const times = dv ?? DEFAULT;
          return (
            <div
              key={day.key}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "8px 10px",
                background: closed ? "transparent" : "var(--bg-soft, #FAF7F1)",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: closed ? "var(--tl)" : "var(--text)",
                }}
              >
                {day.label}
              </div>

              {closed ? (
                <div style={{ fontSize: 12, color: "var(--tl)", fontStyle: "italic" }}>
                  Gesloten op deze dag
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="time"
                    value={times.open}
                    onChange={(e) => updateDay(day.key, { ...times, open: e.target.value })}
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
                    value={times.close}
                    onChange={(e) => updateDay(day.key, { ...times, close: e.target.value })}
                    style={{
                      padding: "4px 6px",
                      border: "1px solid var(--border, #E5DFD0)",
                      borderRadius: 4,
                      fontSize: 13,
                      width: 90,
                    }}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => updateDay(day.key, closed ? { ...DEFAULT } : null)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid var(--border, #E5DFD0)",
                  background: closed ? "var(--brand, #1F4A2D)" : "transparent",
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
