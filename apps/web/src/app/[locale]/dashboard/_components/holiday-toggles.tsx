"use client";

// Feestdagen per stuk aan of uit (mig 0082). Standaard staan ze allemaal aan;
// de eigenaar haalt het vinkje weg bij een feestdag waarop Filly niet moet
// inspelen. De waarde is de lijst UITGEZETTE feestdagen (bv. "1e-paasdag").

import { useTranslations } from "next-intl";

// Zelfde sleutels als holidayId() in apps/api/src/ai/timing-factors.ts,
// in kalendervolgorde.
export const HOLIDAY_IDS = [
  "nieuwjaarsdag",
  "valentijnsdag",
  "goede-vrijdag",
  "1e-paasdag",
  "2e-paasdag",
  "koningsdag",
  "bevrijdingsdag",
  "moederdag",
  "hemelvaartsdag",
  "1e-pinksterdag",
  "2e-pinksterdag",
  "vaderdag",
  "sinterklaasavond",
  "1e-kerstdag",
  "2e-kerstdag",
  "oudejaarsavond",
] as const;

type Props = {
  disabled: string[];
  onChange: (next: string[]) => void;
};

export function HolidayToggles({ disabled, onChange }: Props) {
  const t = useTranslations("dash_account_page.events");
  const uit = new Set(disabled);

  return (
    <div style={{ marginTop: 14 }}>
      <label style={{ display: "block", marginBottom: 6 }}>
        {t("holidayListLabel")}
      </label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {HOLIDAY_IDS.map((id) => {
          const checked = !uit.has(id);
          return (
            <label
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                cursor: "pointer",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
                padding: "6px 10px",
                whiteSpace: "nowrap",
                marginBottom: 0,
                background: checked ? "var(--white, #FFFFFF)" : "transparent",
                opacity: checked ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = new Set(uit);
                  if (checked) next.add(id);
                  else next.delete(id);
                  onChange([...next]);
                }}
              />
              {t(`holiday.${id}`)}
            </label>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "var(--tl)",
          lineHeight: 1.4,
        }}
      >
        {t("holidayListHint")}
      </div>
    </div>
  );
}
