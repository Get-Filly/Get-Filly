"use client";

import { maandenNL } from "../_lib/calendar-data";
import {
  getWeekdayHistory,
  getYearMonthlyAverages,
  weekdayLabel,
} from "../_lib/chart-data";
import type { OccupancyDay } from "../../../lib/api";

const W = 500;
const H = 100;

function buildPath(values: number[]) {
  if (values.length === 0) return { line: "", area: "" };
  const step = values.length === 1 ? 0 : W / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * step,
    y: H - (v / 100) * H,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return { line, area };
}

type View = "dag" | "maand" | "jaar";

type Props = {
  view: View;
  year: number;
  month: number;
  selectedDay: number | null;
  occupancy: OccupancyDay[];
};

export function ChartCard({ view, year, month, selectedDay, occupancy }: Props) {
  const monthName = maandenNL[month];

  let values: number[] = [];
  let title = "Bezettingstrend";
  let subtitle = "";
  let labels: [string, string, string] = ["", "", ""];

  if (view === "dag" && selectedDay) {
    const jsDay = new Date(year, month, selectedDay).getDay();
    values = getWeekdayHistory(jsDay);
    subtitle = `${weekdayLabel(jsDay)} — afgelopen 6 maanden`;
    labels = ["-6 mnd", "-3 mnd", "nu"];
  } else if (view === "jaar") {
    values = getYearMonthlyAverages(year);
    subtitle = `Per maand — ${year}`;
    labels = ["jan", "jul", "dec"];
  } else {
    // Maand-view: gebruik echte occupancy-data
    values = occupancy.map((d) => d.occupancy_pct);
    subtitle = `Per dag — ${monthName} ${year}`;
    const short = monthName.slice(0, 3);
    labels = [
      `1 ${short}`,
      values.length > 0
        ? `${Math.round(values.length / 2)} ${short}`
        : "",
      values.length > 0 ? `${values.length} ${short}` : "",
    ];
  }

  if ((view === "dag" && !selectedDay) || values.length === 0) {
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">Bezettingstrend</div>
            <div className="card-st">
              {view === "dag"
                ? "Selecteer een dag in de kalender"
                : "Geen data beschikbaar"}
            </div>
          </div>
        </div>
        <div className="card-b">
          <div className="chart-box" style={{ minHeight: 140 }} />
        </div>
      </div>
    );
  }

  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const { line, area } = buildPath(values);
  const avgY = H - (avg / 100) * H;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">{title}</div>
          <div className="card-st">{subtitle}</div>
        </div>
      </div>
      <div className="card-b">
        <div className="chart-box">
          <svg
            className="chart-svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--white)" />
              </linearGradient>
            </defs>
            <line className="chart-avg" x1="0" y1={avgY} x2={W} y2={avgY} />
            <path className="chart-area" d={area} />
            <path className="chart-line" d={line} />
          </svg>
          <div className="chart-labels">
            <span className="chart-lbl">{labels[0]}</span>
            <span className="chart-lbl">{labels[1]}</span>
            <span className="chart-lbl">{labels[2]}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--tl)" }}>
            <span style={{ color: "var(--orange)" }}>–––</span> Gemiddelde:{" "}
            {avg}%
          </div>
        </div>
      </div>
    </div>
  );
}
