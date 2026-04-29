"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchFillyAttribution,
  fetchFillyRoi6Months,
  fetchGuests,
  fetchOccupancy,
  type Campaign,
  type CampaignAttribution,
  type FillyRoiMonth,
  type Guest,
  type OccupancyDay,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

const dayLabels = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

const maandenNL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

function monthLabel(year: number, month: number): string {
  const name = maandenNL[month];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// Bezetting-gezondheid met signaalkleuren (semantisch: rood=slecht,
// groen=goed). Deze blijft bewust buiten de brand-kleuren want de
// betekenis is primair status, niet brand.
function occColor(pct: number): string {
  if (pct >= 80) return "#16A34A";
  if (pct >= 60) return "#84CC16";
  if (pct >= 40) return "#F97316";
  return "#DC2626";
}

// Heatmap-intensiteit op brand-groen i.p.v. zwart. Alpha schaalt met
// bezettingspercentage — donkere cel = druk.
function heatmapCell(pct: number): string {
  const alpha = (pct / 100) * 0.85;
  return `rgba(31, 74, 45, ${alpha})`;
}

// Mock hourly occupancy: 7 days x 11 time-slots (11:00-22:00).
const hourLabels = ["11", "12", "13", "14", "15", "17", "18", "19", "20", "21", "22"];
function generateMockHourly(): number[][] {
  const baseline = [40, 75, 80, 35, 15, 25, 65, 90, 95, 70, 40];
  return dayLabels.map((_, dayIdx) => {
    const dayBoost = dayIdx >= 4 ? 20 : dayIdx === 3 ? 5 : 0;
    return baseline.map((b, i) => {
      const jitter = ((dayIdx * 3 + i * 7) % 13) - 6;
      return Math.max(0, Math.min(100, b + dayBoost + jitter));
    });
  });
}
const hourlyData = generateMockHourly();

// Filly-ROI cijfers komen sinds 2026-04-29 uit échte aggregaties
// over reservations.via_campaign_id (migratie 0022). Eigenaar koppelt
// reserveringen handmatig aan campagnes op de reserveringen-pagina;
// straks gebeurt dit automatisch via de send-engine click-tracking.
//
// De maand-grafiek + per-kanaal-tabel hieronder lezen uit twee KPI-
// endpoints: /kpi/filly-roi-6m en /kpi/filly-attribution.

export default function RapportagesPage() {
  const today = new Date();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  // Filly-ROI data uit échte attributie. fetchFillyRoi6Months returnt
  // 6 buckets (oudste eerst) en fetchFillyAttribution returnt per-
  // campagne aggregaties van de huidige maand.
  const [fillyRoi6m, setFillyRoi6m] = useState<FillyRoiMonth[]>([]);
  const [fillyByCampaign, setFillyByCampaign] = useState<
    CampaignAttribution[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Geselecteerde maand waar de bezetting- en gast-KPI's op gebaseerd zijn.
  // Met prev/next kun je terug in de tijd — "hoe ging maart?". Trend-secties
  // (Filly-ROI, retentie-cohort) blijven op eigen rolling window.
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Campagnes + gasten zijn niet maand-gebonden dus 1× op mount laden.
  useEffect(() => {
    Promise.all([
      fetchCampaigns(),
      fetchGuests(),
      fetchFillyRoi6Months(),
      fetchFillyAttribution(),
    ])
      .then(([c, g, roi, attr]) => {
        setCampaigns(c);
        setGuests(g);
        setFillyRoi6m(roi);
        setFillyByCampaign(attr);
      })
      .catch(() => {});
  }, []);

  // Occupancy verandert per geselecteerde maand — bij elke prev/next opnieuw.
  useEffect(() => {
    setLoading(true);
    fetchOccupancy(viewYear, viewMonth)
      .then((o) => {
        setOccupancy(o);
        setLoading(false);
      })
      .catch(() => {
        setOccupancy([]);
        setLoading(false);
      });
  }, [viewYear, viewMonth]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

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
      avgOcc,
      totalRevenue,
      totalEstGuests,
    };
  }, [campaigns, guests, occupancy]);

  // YoY-cijfers zijn nog placeholder — komen straks uit een
  // `getMonthMetrics(year-1, month)`-call. Gemarkeerd als TODO.
  const yoy = { occ: 7, guests: 12, revenue: 9 };

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
        Inzicht in bezetting, gasten, campagnes en wat Filly je oplevert.
      </div>

      {/* Maand-navigator: bladeren door historische maanden. Vervangt de
          oude periode-tabs die niks filterden. */}
      <div className="rep-month-nav">
        <button
          className="cal-nav-btn"
          onClick={goPrev}
          aria-label="Vorige maand"
        >
          ‹
        </button>
        <div className="rep-month-label">
          {monthLabel(viewYear, viewMonth)}
        </div>
        <button
          className="cal-nav-btn"
          onClick={goNext}
          aria-label="Volgende maand"
        >
          ›
        </button>
        {!isCurrentMonth && (
          <button className="cal-today-btn" onClick={goToday}>
            Vandaag
          </button>
        )}
      </div>

      {loading ? (
        <div className="table-empty">Laden...</div>
      ) : guests.length === 0 &&
        campaigns.length === 0 &&
        occupancy.length === 0 ? (
        // Volledige empty-state voor nieuwe klanten zonder data. Zonder
        // deze check zien ze overal "0%" + "0 gasten" en denken ze dat
        // er iets mis is. Beter expliciet uitleggen dat data nog moet
        // komen.
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">📊</div>
          <div className="empty-title">Nog geen data om te rapporteren</div>
          <div className="empty-desc">
            Zodra reserveringen, gasten en campagnes binnenkomen
            verschijnen hier de cijfers — gemiddelde bezetting, omzet,
            Filly-ROI, retentie en meer. Begin met een eerste campagne
            of importeer je gasten-bestand.
          </div>
        </div>
      ) : (
        <>
          {/* =====================================================
              SECTIE 1 — Bezetting & omzet
              ===================================================== */}
          <div className="rep-section">
            <div className="rep-section-eyebrow">Bezetting & omzet</div>
            <div className="rep-section-title">Hoe doe je het?</div>
            <div className="rep-section-desc">
              De basisgezondheid van je zaak: gemiddelde bezetting, gasten,
              omzet en vergelijking met vorig jaar.
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-label">Gem. bezetting</div>
              <div className="stat-card-val">{stats.avgOcc}%</div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  marginTop: 2,
                  fontWeight: 500,
                }}
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
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  marginTop: 2,
                  fontWeight: 500,
                }}
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
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  marginTop: 2,
                  fontWeight: 500,
                }}
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
                  Gemiddeld in {monthLabel(viewYear, viewMonth)} · zwakste
                  dag: {dayLabels[worstDay]} · sterkste: {dayLabels[bestDay]}
                </div>
              </div>
            </div>
            <div className="card-b">
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
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
                  Patroon over de week · donkere cellen = drukker
                </div>
              </div>
            </div>
            <div className="card-b">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

          {/* =====================================================
              SECTIE 2 — Filly ROI
              ===================================================== */}
          {(() => {
            const totalReservations = fillyRoi6m.reduce(
              (s, m) => s + m.reservations,
              0,
            );
            const totalGuests = fillyRoi6m.reduce(
              (s, m) => s + m.guests,
              0,
            );
            const totalRevenue = fillyRoi6m.reduce(
              (s, m) => s + m.estimated_revenue_cents,
              0,
            );
            const maxRoiMonth = Math.max(
              1,
              ...fillyRoi6m.map((m) => m.estimated_revenue_cents),
            );
            const hasFillyData = totalReservations > 0;

            return (
              <>
                <div className="rep-section">
                  <div className="rep-section-eyebrow">Filly ROI</div>
                  <div className="rep-section-title">
                    Wat heeft Filly je opgeleverd?
                  </div>
                  <div className="rep-section-desc">
                    Cumulatieve bijdrage van Filly over de afgelopen 6
                    maanden — gebaseerd op reserveringen die handmatig of
                    automatisch zijn gekoppeld aan een Filly-campagne.
                  </div>
                </div>

                {!hasFillyData ? (
                  <div className="empty-state" style={{ marginBottom: 16 }}>
                    <div className="empty-icon">📈</div>
                    <div className="empty-title">
                      Nog geen reserveringen via Filly gekoppeld
                    </div>
                    <div className="empty-desc">
                      Koppel reserveringen aan een Filly-campagne op de
                      reserveringen-pagina (of wacht tot de send-engine
                      automatisch attribuueert) — dan verschijnen hier
                      cumulatieve cijfers, een 6-maanden grafiek en een
                      per-kanaal vergelijking.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Totalen-callout: 3 kerncijfers naast elkaar */}
                    <div className="roi-breakeven">
                      <div className="roi-breakeven-item">
                        <span className="roi-breakeven-label">
                          Reserveringen via Filly
                        </span>
                        <span className="roi-breakeven-val">
                          {totalReservations}
                        </span>
                        <span className="roi-breakeven-sub">
                          afgelopen 6 maanden
                        </span>
                      </div>
                      <div className="roi-breakeven-item">
                        <span className="roi-breakeven-label">
                          Gasten via Filly
                        </span>
                        <span className="roi-breakeven-val">
                          {totalGuests}
                        </span>
                        <span className="roi-breakeven-sub">
                          som van groepsgroottes
                        </span>
                      </div>
                      <div className="roi-breakeven-item">
                        <span className="roi-breakeven-label">
                          Geschatte omzet
                        </span>
                        <span className="roi-breakeven-val">
                          €
                          {Math.round(
                            totalRevenue / 100,
                          ).toLocaleString("nl-NL")}
                        </span>
                        <span className="roi-breakeven-sub">
                          gasten × gem. besteding
                        </span>
                      </div>
                    </div>

                    {/* Maand-grafiek */}
                    <div
                      className="card"
                      style={{ marginBottom: 16, marginTop: 16 }}
                    >
                      <div className="card-h">
                        <div>
                          <div className="card-t">
                            Filly-bijdrage per maand
                          </div>
                          <div className="card-st">
                            Geschatte extra omzet (€) via Filly-campagnes
                          </div>
                        </div>
                      </div>
                      <div className="card-b">
                        <div className="roi-chart">
                          {fillyRoi6m.map((m) => {
                            const height = Math.round(
                              (m.estimated_revenue_cents / maxRoiMonth) * 100,
                            );
                            const monthLabel = new Date(
                              m.month + "-01",
                            ).toLocaleDateString("nl-NL", { month: "short" });
                            const euros = Math.round(
                              m.estimated_revenue_cents / 100,
                            );
                            return (
                              <div key={m.month} className="roi-chart-col">
                                <span className="roi-chart-val">
                                  {euros > 0
                                    ? `€${euros.toLocaleString("nl-NL")}`
                                    : "—"}
                                </span>
                                <div
                                  className="roi-chart-bar"
                                  style={{
                                    height: `${Math.max(height, 2)}%`,
                                  }}
                                  title={`${monthLabel}: €${euros} / ${m.guests} gasten / ${m.reservations} reserveringen`}
                                />
                                <span className="roi-chart-label">
                                  {monthLabel}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Per campagne — alleen tonen als er data is */}
                    {fillyByCampaign.length > 0 && (
                      <div className="card" style={{ marginBottom: 16 }}>
                        <div className="card-h">
                          <div>
                            <div className="card-t">
                              Per campagne deze maand
                            </div>
                            <div className="card-st">
                              Welke campagne levert het meest op?
                            </div>
                          </div>
                        </div>
                        <div className="card-b">
                          <table
                            className="data-table"
                            style={{ fontSize: 12 }}
                          >
                            <thead>
                              <tr>
                                <th>Campagne</th>
                                <th>Type</th>
                                <th style={{ textAlign: "right" }}>
                                  Reserveringen
                                </th>
                                <th style={{ textAlign: "right" }}>Gasten</th>
                                <th style={{ textAlign: "right" }}>
                                  Geschatte omzet
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {fillyByCampaign.map((c) => {
                                const icon =
                                  c.campaign_type === "mail"
                                    ? "✉️"
                                    : c.campaign_type === "social"
                                      ? "📱"
                                      : "💬";
                                return (
                                  <tr key={c.campaign_id}>
                                    <td style={{ fontWeight: 500 }}>
                                      {c.campaign_name}
                                    </td>
                                    <td>
                                      <span style={{ marginRight: 6 }}>
                                        {icon}
                                      </span>
                                      <span
                                        style={{
                                          textTransform: "capitalize",
                                        }}
                                      >
                                        {c.campaign_type}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                      {c.reservations}
                                    </td>
                                    <td
                                      style={{
                                        textAlign: "right",
                                        color: "var(--accent)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      +{c.guests}
                                    </td>
                                    <td
                                      style={{
                                        textAlign: "right",
                                        color: "var(--accent)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      €
                                      {Math.round(
                                        c.estimated_revenue_cents / 100,
                                      ).toLocaleString("nl-NL")}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}

          {/* =====================================================
              SECTIE 3 — Gasten & retentie
              ===================================================== */}
          <div className="rep-section">
            <div className="rep-section-eyebrow">Gasten & retentie</div>
            <div className="rep-section-title">Komen je gasten terug?</div>
            <div className="rep-section-desc">
              Van 100 gasten die in maand X voor het eerst kwamen — hoeveel
              kwamen er in de maanden erna nog terug? Hoge % = loyaliteit,
              lage % = kans voor Filly om een win-back te sturen.
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Gastretentie per maand</div>
                <div className="card-st">
                  Percentage dat terugkwam in de maanden erna
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
                            color: v === null ? "var(--tl)" : "var(--text)",
                            background:
                              v === null
                                ? "transparent"
                                : `rgba(31, 74, 45, ${(v / c.size) * 0.18})`,
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

          {/* =====================================================
              SECTIE 4 — Campagnes (bestaande top-3)
              ===================================================== */}
          <div className="rep-section">
            <div className="rep-section-eyebrow">Marketing</div>
            <div className="rep-section-title">Wat werkt er qua campagnes?</div>
            <div className="rep-section-desc">
              Top-campagnes op basis van status en doorlooptijd.
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div>
                <div className="card-t">Top campagnes</div>
                <div className="card-st">Meest succesvol deze periode</div>
              </div>
            </div>
            <div className="card-b">
              {campaigns
                .filter((c) => c.status === "actief" || c.status === "afgerond")
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
