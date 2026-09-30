"use client";

// "Mijn momenten": de eigenaar zet momenten (weekdag x dagdeel) aan of uit.
// Een moment dat uit staat krijgt nooit een voorstel van Filly. Zelf een
// campagne inplannen op zo'n moment kan altijd.
//
// De waarde is een lijst UITGEZETTE momenten als "weekdag|dagdeel" (0=ma..6=zo),
// zoals de kolom businesses.quiet_disabled_slots (mig 0080). Leeg = alles aan.

import { useMemo } from "react";
import { useTranslations } from "next-intl";

const DAGDELEN = ["ochtend", "lunch", "middag", "diner"] as const;
const slotKey = (dag: number, dagdeel: string) => `${dag}|${dagdeel}`;

type Props = {
  disabled: string[];
  onChange: (next: string[]) => void;
};

export function QuietSlotsGrid({ disabled, onChange }: Props) {
  const t = useTranslations("dash_account_page.notifications");
  const uit = useMemo(() => new Set(disabled), [disabled]);

  const dagen = [0, 1, 2, 3, 4, 5, 6];
  const totaal = dagen.length * DAGDELEN.length;
  const aan = totaal - uit.size;

  const zet = (keys: string[], zetUit: boolean) => {
    const n = new Set(uit);
    for (const k of keys) {
      if (zetUit) n.add(k);
      else n.delete(k);
    }
    onChange([...n]);
  };
  const dagKeys = (d: number) => DAGDELEN.map((dd) => slotKey(d, dd));
  const deelKeys = (dd: string) => dagen.map((d) => slotKey(d, dd));

  const uitgezetteDagen = dagen.filter((d) =>
    dagKeys(d).every((k) => uit.has(k)),
  );

  let samenvatting: string | null = null;
  if (aan > 0) {
    if (uit.size === 0) {
      samenvatting = t("slotSummaryAll");
    } else {
      const lijst = dagen.flatMap((d) =>
        DAGDELEN.filter((dd) => uit.has(slotKey(d, dd))).map(
          (dd) => `${t(`slotDay${d}`).toLowerCase()} ${t(`slotPart${dd}`).toLowerCase()}`,
        ),
      );
      const kort =
        lijst.length > 4
          ? t("slotSummaryMore", {
              first: lijst.slice(0, 4).join(", "),
              count: lijst.length - 4,
            })
          : lijst.join(", ");
      samenvatting = t("slotSummary", { on: aan, total: totaal, list: kort });
    }
  }

  const hint: React.CSSProperties = {
    marginTop: 6,
    fontSize: 12,
    color: "var(--tl)",
    lineHeight: 1.4,
  };

  return (
    <div>
      <div style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
        {t("slotsIntro")}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 6 }}>
          <thead>
            <tr>
              <th />
              {dagen.map((d) => {
                const allesUit = dagKeys(d).every((k) => uit.has(k));
                return (
                  <th key={d}>
                    <button
                      type="button"
                      onClick={() => zet(dagKeys(d), !allesUit)}
                      title={allesUit ? t("slotDayOnTitle") : t("slotDayOffTitle")}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        color: allesUit ? "var(--tl)" : "var(--text, #18181B)",
                        textDecoration: allesUit ? "line-through" : "none",
                      }}
                    >
                      {t(`slotDay${d}`)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {DAGDELEN.map((dd) => {
              const rijUit = deelKeys(dd).every((k) => uit.has(k));
              return (
                <tr key={dd}>
                  <th style={{ textAlign: "left", paddingRight: 8 }}>
                    <button
                      type="button"
                      onClick={() => zet(deelKeys(dd), !rijUit)}
                      title={rijUit ? t("slotRowOnTitle") : t("slotRowOffTitle")}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0,
                        lineHeight: 1.25,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text, #18181B)",
                        }}
                      >
                        {t(`slotPart${dd}`)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--tl)",
                          fontWeight: 400,
                        }}
                      >
                        {t(`slotHours${dd}`)}
                      </div>
                    </button>
                  </th>
                  {dagen.map((d) => {
                    const k = slotKey(d, dd);
                    const isUit = uit.has(k);
                    return (
                      <td key={k}>
                        <button
                          type="button"
                          onClick={() => zet([k], !isUit)}
                          aria-pressed={!isUit}
                          aria-label={t("slotPartsAria", {
                            day: t(`slotDay${d}`),
                            part: t(`slotPart${dd}`).toLowerCase(),
                            state: isUit ? t("slotOff") : t("slotOn"),
                          })}
                          style={{
                            width: 58,
                            height: 44,
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                            border: isUit
                              ? "1px solid #E4C7B8"
                              : "1px solid #BFD6C5",
                            background: isUit ? "#F7E6DD" : "#E6EFE8",
                            color: isUit ? "#9A5030" : "#1F4A2D",
                          }}
                        >
                          {isUit ? t("slotOff") : t("slotOn")}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange([])}
          disabled={uit.size === 0}
        >
          {t("slotAllOn")}
        </button>
        <span
          style={{ fontSize: 13, color: aan === 0 ? "#B3261E" : "var(--tl)" }}
        >
          {aan === 0 ? t("slotAllOff") : samenvatting}
        </span>
      </div>
      {uitgezetteDagen.length > 0 && aan > 0 && (
        <div style={hint}>
          {t("slotDayOff", {
            days: uitgezetteDagen
              .map((d) => t(`slotDay${d}`).toLowerCase())
              .join(", "),
          })}
        </div>
      )}
    </div>
  );
}
