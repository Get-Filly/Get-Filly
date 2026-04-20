"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchReviews,
  type Review,
  type ReviewSource,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

const sourceInfo: Record<ReviewSource, { label: string; icon: string }> = {
  google: { label: "Google", icon: "🔎" },
  tripadvisor: { label: "TripAdvisor", icon: "🦉" },
  thefork: { label: "The Fork", icon: "🍴" },
  iens: { label: "IENS", icon: "🇳🇱" },
};

type SourceFilter = "alle" | ReviewSource;

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#F59E0B", letterSpacing: 2 }}>
      {"★".repeat(rating)}
      <span style={{ color: "var(--border)" }}>
        {"★".repeat(5 - rating)}
      </span>
    </span>
  );
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("alle");

  useEffect(() => {
    fetchReviews()
      .then((d) => {
        setReviews(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (reviews.length === 0)
      return { avg: 0, total: 0, perSource: {} as Record<string, { count: number; avg: number }>, needsResponse: 0 };
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const perSource: Record<string, { count: number; avg: number }> = {};
    for (const r of reviews) {
      if (!perSource[r.source]) perSource[r.source] = { count: 0, avg: 0 };
      perSource[r.source].count++;
    }
    for (const src in perSource) {
      const sub = reviews.filter((r) => r.source === src);
      perSource[src].avg = sub.reduce((s, r) => s + r.rating, 0) / sub.length;
    }
    const needsResponse = reviews.filter(
      (r) => r.rating <= 3 && !r.response_text,
    ).length;
    return { avg, total: reviews.length, perSource, needsResponse };
  }, [reviews]);

  const filtered = useMemo(() => {
    if (filter === "alle") return reviews;
    return reviews.filter((r) => r.source === filter);
  }, [reviews, filter]);

  const sourceFilters: SourceFilter[] = [
    "alle",
    ...(Object.keys(sourceInfo) as ReviewSource[]),
  ];

  return (
    <div className="page-full">
      <div className="page-title">Reviews</div>
      <div className="page-subtitle">
        Wat gasten zeggen op Google, TripAdvisor en The Fork. Reageer snel op
        lage scores.
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Gemiddelde</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              <>
                {stats.avg.toFixed(1)}{" "}
                <span style={{ fontSize: 14, color: "#F59E0B" }}>★</span>
              </>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Totaal reviews</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Reactie nodig (≤3 ★)</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              <span style={{ color: stats.needsResponse > 0 ? "#DC2626" : "inherit" }}>
                {stats.needsResponse}
              </span>
            )}
          </div>
        </div>
        {Object.entries(stats.perSource)
          .slice(0, 2)
          .map(([src, info]) => (
            <div key={src} className="stat-card">
              <div className="stat-card-label">
                {sourceInfo[src as ReviewSource]?.label ?? src}
              </div>
              <div className="stat-card-val">
                {info.avg.toFixed(1)} ★{" "}
                <span style={{ fontSize: 12, color: "var(--tl)", fontWeight: 400 }}>
                  ({info.count})
                </span>
              </div>
            </div>
          ))}
      </div>

      <div className="tabs">
        {sourceFilters.map((f) => (
          <button
            key={f}
            className={`tab-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "alle" ? "Alle" : sourceInfo[f].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={100} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-empty">Geen reviews in deze categorie.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r) => {
            const src = sourceInfo[r.source];
            const needsResponse = r.rating <= 3 && !r.response_text;
            return (
              <div
                key={r.id}
                style={{
                  background: "var(--white)",
                  border: `1px solid ${needsResponse ? "#FCA5A5" : "var(--border)"}`,
                  borderRadius: "var(--r)",
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Stars rating={r.rating} />
                      <span style={{ fontSize: 12, color: "var(--tl)" }}>
                        {src.icon} {src.label}
                      </span>
                      {needsResponse && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "var(--rf)",
                            background: "#FEE2E2",
                            color: "#B91C1C",
                            textTransform: "uppercase",
                            letterSpacing: "0.3px",
                          }}
                        >
                          Actie vereist
                        </span>
                      )}
                    </div>
                    {r.title && (
                      <div
                        style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}
                      >
                        {r.title}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tl)" }}>
                    {formatDate(r.review_date)}
                  </div>
                </div>
                {r.body && (
                  <div
                    style={{ fontSize: 13, color: "var(--ts)", lineHeight: 1.6 }}
                  >
                    {r.body}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tl)",
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>— {r.author ?? "Anoniem"}</span>
                  {needsResponse ? (
                    <button
                      className="sg-btn"
                      style={{ padding: "4px 12px", fontSize: 11 }}
                    >
                      Reageren
                    </button>
                  ) : r.response_text ? (
                    <span style={{ color: "#1B7A2E" }}>✓ Gereageerd</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
