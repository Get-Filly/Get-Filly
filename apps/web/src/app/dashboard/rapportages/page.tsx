"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchGuests,
  fetchOccupancy,
  type Campaign,
  type Guest,
  type OccupancyDay,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

type Period = "maand" | "kwartaal" | "jaar";

const periodLabel: Record<Period, string> = {
  maand: "Deze maand",
  kwartaal: "Dit kwartaal",
  jaar: "Dit jaar",
};

const dayLabels = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function occColor(pct: number): string {
  if (pct >= 80) return "#16A34A";
  if (pct >= 60) return "#84CC16";
  if (pct >= 40) return "#F97316";
  return "#DC2626";
}

function heatmapCell(pct: number): string {
  // Off-white → accent intensity via alpha
  const alpha = pct / 100;
  return `rgba(15, 15, 15, ${alpha * 0.85})`;
}

// Mock hourly occupancy: 7 days x 12 hours (10:00-21:00)
const hourLabels = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
];
function generateMockHourly(): number[][] {
  const baseline = [40, 75, 80, 35, 15, 25, 65, 90, 95, 70, 40];
  return dayLabels.map((_, dayIdx) => {
    const dayBoost = dayIdx >= 4 ? 20 : dayIdx === 3 ? 5 : 0; // weekend druk
    return baseline.map((b, i) => {
      const jitter = ((dayIdx * 3 + i * 7) % 13) - 6;
      return Math.max(0, Math.min(100, b + dayBoost + jitter));
    });
  });
}
const hourlyData = generateMockHourly();

export default function RapportagesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("maand");

  useEffect(() => {
    const now = new Date();
    Promise.all([
      fetchCampaigns(),
      fetchGuests(),
      fetchOccupancy(now.getFullYear(), now.getMonth()),
    ])
      .then(([c, g, o]) => {
        setCampaigns(c);
        setGuests(g);
        setOccupancy(o);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const dayOfWeekAvg = useMemo(() => {
    const buckets: number[][] = [[], [], [], [], [], [], []];
    for (const d of occupancy) {
      const date = new Date(d.date);
      const idx = mondayIndex(date.getDay());
      buckets[idx].push(d.occupancy_pct);
    }
    return buckets.map((values) =>
      values.length > 0
        ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
        : 0,
    );
  }, [occupancy]);

  const stats = useMemo(() => {
    const totalGuests = guests.length;
    const totalCampaigns = campaigns.length;
    const byType = campaigns.reduce(
      (acc, c) => {
        acc[c.type] = (acc[c.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const avgOcc = occupancy.length
      ? Math.round(
          occupancy.reduce((s, d) => s + d.occupancy_pct, 0) / occupancy.length,
        )
      : 0;
    const totalRevenue = occupancy.reduce(
      (s, d) => s + d.estimated_revenue_cents,
      0,
    );
    const totalEstGuests = occupancy.reduce(
      (s, d) => s + d.estimated_guests,
      0,
    );
    return {
      totalGuests,
      totalCampaigns,
      byType,
      avgOcc,
      totalRevenue,
      totalEstGuests,
    };
  }, [campaigns, guests, occupancy]);

  const yoy = { occ: 7, guests: 12, revenue: 9 }; // mock YoY — later uit historische data

  // Mock retention cohort: % gasten uit X die in opvolgende maanden terugkwamen
  const cohortData = [
    { month: "Dec 2025", size: 42, m1: 38, m2: 29, m3: 22, m4: 18 },
    { month: "Jan 2026", size: 38, m1: 32, m2: 25, m3: 20, m4: null },
    { month: "Feb 2026", size: 45, m1: 40, m2: 31, m3: null, m4: null },
    { month: "Mar 2026", size: 51, m1: 44, m2: null, m3: null, m4: null },
  ];

  const worstDay = dayOfWeekAvg.indexOf(Math.min(...dayOfWeekAvg));
  const bestDay = dayOfWeekAvg.indexOf(Math.max(...dayOfWeekAvg));

  return (
    <div className="page-full">
      <div className="page-title">Rapportages</div>
      <div className="page-subtitle">
        Inzicht in bezetting, gasten, campagnes en patronen.
      </div>

      <div className="tabs">
        {(["maand", "kwartaal", "jaar"] as Period[]).map((p) => (
          <button
            key={p}
            className={`tab-btn ${period === p ? "active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {periodLabel[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="table-empty">Laden...</div>
      ) : (
        <>
          {/* KPI met YoY */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-label">Gem. bezetting</div>
              <div className="stat-card-val">{stats.avgOcc}%</div>
              <div
                style={{ fontSize: 11, color: "#16A34A", marginTop: 2 }}
              >
                ↑ {yoy.occ}% vs vorig jaar
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Totaal gasten</div>
              <div className="stat-card-val">
                {stats.totalEstGuests.toLocaleString("nl-NL")}
              </div>
              <div
                style={{ fontSize: 11, color: "#16A34A", marginTop: 2 }}
              >
                ↑ {yoy.guests}% vs vorig jaar
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Omzet</div>
              <div className="stat-card-val">
                €{Math.round(stats.totalRevenue / 100).toLocaleString("nl-NL")}
              </div>
              <div
                style={{ fontSize: 11, color: "#16A34A", marginTop: 2 }}
              >
                ↑ {yoy.revenue}% vs vorig jaar
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Campagnes</div>
              <div className="stat-card-val">{stats.totalCampaigns}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Gasten in DB</div>
              <div className="stat-card-val">{stats.totalGuests}</div>
            </div>
          </div>

          {/* Dag-van-week */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Bezetting per weekdag</div>
                <div className="card-st">
                  Gemiddeld — {periodLabel[period]} · zwakste dag:{" "}
                  {dayLabels[worstDay]} · sterkste: {dayLabels[bestDay]}
                </div>
              </div>
            </div>
            <div className="card-b">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {dayOfWeekAvg.map((pct, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px 1fr 44px",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--tl)",
                      }}
                    >
                      {dayLabels[i]}
                    </div>
                    <div
                      style={{
                        height: 10,
                        background: "var(--bg)",
                        borderRadius: 5,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: occColor(pct),
                          borderRadius: 5,
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      {pct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Uur-van-dag heatmap */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Bezetting per uur</div>
                <div className="card-st">
                  Patroon over de week · donkere cellen = drukker (mock)
                </div>
              </div>
            </div>
            <div className="card-b">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `36px repeat(${hourLabels.length}, 1fr)`,
                    gap: 2,
                  }}
                >
                  <div></div>
                  {hourLabels.map((h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 10,
                        color: "var(--tl)",
                        textAlign: "center",
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {hourlyData.map((row, dIdx) => (
                  <div
                    key={dIdx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `36px repeat(${hourLabels.length}, 1fr)`,
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--tl)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {dayLabels[dIdx]}
                    </div>
                    {row.map((pct, hIdx) => (
                      <div
                        key={hIdx}
                        title={`${dayLabels[dIdx]} ${hourLabels[hIdx]}:00 — ${pct}%`}
                        style={{
                          height: 22,
                          background: heatmapCell(pct),
                          borderRadius: 3,
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                    fontSize: 11,
                    color: "var(--tl)",
                  }}
                >
                  <span>Rustig</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[10, 30, 50, 70, 90].map((v) => (
                      <div
                        key={v}
                        style={{
                          width: 18,
                          height: 10,
                          background: heatmapCell(v),
                          borderRadius: 2,
                        }}
                      />
                    ))}
                  </div>
                  <span>Druk</span>
                </div>
              </div>
            </div>
          </div>

          {/* Retentie cohort */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Gastretentie per maand</div>
                <div className="card-st">
                  Van 100 gasten in maand X, hoeveel kwamen er terug? (mock)
                </div>
              </div>
            </div>
            <div className="card-b">
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th style={{ textAlign: "right" }}>Size</th>
                    <th style={{ textAlign: "right" }}>Mnd 1</th>
                    <th style={{ textAlign: "right" }}>Mnd 2</th>
                    <th style={{ textAlign: "right" }}>Mnd 3</th>
                    <th style={{ textAlign: "right" }}>Mnd 4</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortData.map((c) => (
                    <tr key={c.month}>
                      <td style={{ fontWeight: 500 }}>{c.month}</td>
                      <td style={{ textAlign: "right" }}>{c.size}</td>
                      {[c.m1, c.m2, c.m3, c.m4].map((v, i) => (
                        <td
                          key={i}
                          style={{
                            textAlign: "right",
                            color:
                              v === null ? "var(--tl)" : "var(--text)",
                            background:
                              v === null
                                ? "transparent"
                                : `rgba(15, 15, 15, ${(v / c.size) * 0.15})`,
                          }}
                        >
                          {v === null
                            ? "—"
                            : `${Math.round((v / c.size) * 100)}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Campagnes per kanaal */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Campagnes per kanaal</div>
                <div className="card-st">{periodLabel[period]}</div>
              </div>
            </div>
            <div className="card-b">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div
                    key={type}
                    style={{
                      padding: "12px 18px",
                      background: "var(--bg)",
                      borderRadius: 10,
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        color: "var(--tl)",
                        fontSize: 11,
                        textTransform: "capitalize",
                      }}
                    >
                      {type}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top campagnes */}
          <div className="card">
            <div className="card-h">
              <div>
                <div className="card-t">Top campagnes</div>
                <div className="card-st">Meest succesvol deze periode</div>
              </div>
            </div>
            <div className="card-b">
              {campaigns
                .filter(
                  (c) => c.status === "actief" || c.status === "afgerond",
                )
                .slice(0, 3)
                .map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{c.name}</div>
                      <div style={{ color: "var(--tl)", fontSize: 11 }}>
                        {c.meta}
                      </div>
                    </div>
                    <span className={`badge ${c.status}`}>{c.status}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
