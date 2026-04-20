"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchReservations,
  type Reservation,
  type ReservationStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

const statusInfo: Record<ReservationStatus, { label: string; color: string; bg: string }> = {
  bevestigd: { label: "Bevestigd", color: "#1B7A2E", bg: "#DCFCE7" },
  ingecheckt: { label: "Ingecheckt", color: "#0F0F0F", bg: "#E4E4E7" },
  voltooid: { label: "Voltooid", color: "#52525B", bg: "#F4F4F5" },
  no_show: { label: "No-show", color: "#B91C1C", bg: "#FEE2E2" },
  geannuleerd: { label: "Geannuleerd", color: "#71717A", bg: "#F4F4F5" },
};

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Vandaag";
  if (diffDays === 1) return "Morgen";
  if (diffDays === -1) return "Gisteren";
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function ReserveringenPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch 3 dagen geleden t/m 14 dagen vooruit
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 3);
    const to = new Date(today);
    to.setDate(today.getDate() + 14);

    fetchReservations(
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    )
      .then((d) => {
        setReservations(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (!map.has(r.reservation_date)) map.set(r.reservation_date, []);
      map.get(r.reservation_date)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reservations]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayRes = reservations.filter(
      (r) => r.reservation_date === today && r.status === "bevestigd",
    );
    const totalCovers = todayRes.reduce((s, r) => s + r.party_size, 0);
    const noShows = reservations.filter((r) => r.status === "no_show").length;
    const futureBooked = reservations.filter(
      (r) => r.reservation_date >= today && r.status === "bevestigd",
    ).length;
    return {
      todayCount: todayRes.length,
      todayCovers: totalCovers,
      noShows,
      futureBooked,
    };
  }, [reservations]);

  return (
    <div className="page-full">
      <div className="page-title">Reserveringen</div>
      <div className="page-subtitle">
        Overzicht van wie wanneer komt, bijzonderheden en tafel-assignment.
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Vandaag</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.todayCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Covers vandaag</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.todayCovers}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Komend (14 dgn)</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              stats.futureBooked
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">No-shows (afgelopen)</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.noShows}
          </div>
        </div>
      </div>

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={80} style={{ marginBottom: 10 }} />
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📆</div>
          <div className="empty-title">Geen reserveringen</div>
          <div className="empty-desc">
            Koppel een reserveringsplatform om ze automatisch te importeren.
          </div>
        </div>
      ) : (
        <div>
          {grouped.map(([date, list]) => {
            const dayLabel = formatDayLabel(date);
            const dayCovers = list
              .filter((r) => r.status === "bevestigd")
              .reduce((s, r) => s + r.party_size, 0);
            return (
              <div key={date} style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {dayLabel}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tl)" }}>
                    {list.length} reservering{list.length > 1 ? "en" : ""} ·{" "}
                    {dayCovers} covers
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--white)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    overflow: "hidden",
                  }}
                >
                  {list.map((r, idx) => {
                    const info = statusInfo[r.status];
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 1fr auto auto auto",
                          gap: 16,
                          padding: "14px 18px",
                          borderTop:
                            idx === 0 ? "none" : "1px solid var(--border-soft)",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.reservation_time.slice(0, 5)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>
                            {r.guest_name ?? "—"}{" "}
                            <span
                              style={{
                                color: "var(--tl)",
                                fontWeight: 400,
                                fontSize: 12,
                              }}
                            >
                              · {r.party_size} pers
                            </span>
                          </div>
                          <div style={{ color: "var(--tl)", fontSize: 11 }}>
                            {r.guest_phone ?? "—"}
                            {r.source && ` · via ${r.source}`}
                            {r.table_code && ` · tafel ${r.table_code}`}
                          </div>
                          {r.special_requests && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#B45309",
                                background: "#FEF3C7",
                                padding: "2px 8px",
                                borderRadius: 4,
                                marginTop: 4,
                                display: "inline-block",
                              }}
                            >
                              💬 {r.special_requests}
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: "var(--rf)",
                            fontSize: 11,
                            fontWeight: 500,
                            color: info.color,
                            background: info.bg,
                          }}
                        >
                          {info.label}
                        </span>
                        <button
                          className="sg-btn"
                          disabled
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Bellen
                        </button>
                        <button
                          className="sg-btn"
                          disabled
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Details
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
