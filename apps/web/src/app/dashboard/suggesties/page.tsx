"use client";

import { useEffect, useState } from "react";
import {
  fetchSuggestions,
  updateSuggestion,
  type AiSuggestion,
  type SuggestionStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

type Tab = "pending" | "approved" | "rejected";

const tabs: { key: Tab; label: string }[] = [
  { key: "pending", label: "Wachtend" },
  { key: "approved", label: "Goedgekeurd" },
  { key: "rejected", label: "Afgewezen" },
];

const triggerLabel: Record<string, { icon: string; text: string }> = {
  low_occupancy: { icon: "📉", text: "Lage bezetting" },
  weather: { icon: "🌧️", text: "Weer" },
  seasonal: { icon: "📅", text: "Seizoen" },
  birthday: { icon: "🎂", text: "Verjaardag" },
  retention: { icon: "💔", text: "Retentie" },
};

const urgencyColor: Record<string, string> = {
  high: "#DC2626",
  medium: "#F97316",
  low: "#A1A1AA",
};

const urgencyLabel: Record<string, string> = {
  high: "Hoge urgentie",
  medium: "Deze week",
  low: "Planning",
};

function typeChipClass(type?: string) {
  if (type === "mail") return "sg-chip type-mail";
  if (type === "social") return "sg-chip type-social";
  return "sg-chip";
}

function formatEuro(cents?: number): string {
  if (!cents) return "—";
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

export default function SuggestiesPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSuggestions(tab)
      .then((d) => {
        setSuggestions(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [tab]);

  const act = async (id: string, status: SuggestionStatus) => {
    setActingId(id);
    try {
      await updateSuggestion(id, status);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="page-full">
      <div className="page-title">Suggesties</div>
      <div className="page-subtitle">
        Voorstellen van Filly — met onderbouwing én verwachte impact. Keur goed
        → wordt een campagne.
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="suggestions-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="suggestion-card">
              <Skeleton height={10} width="40%" />
              <Skeleton height={20} width="80%" />
              <Skeleton height={60} width="100%" />
              <Skeleton height={14} width="60%" />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Skeleton height={28} width={90} />
                <Skeleton height={28} width={90} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : suggestions.length === 0 ? (
        tab === "pending" ? (
          <div className="empty-state">
            <div className="empty-icon">✨</div>
            <div className="empty-title">Alles bijgewerkt</div>
            <div className="empty-desc">
              Geen voorstellen wachtend. Filly laat het weten zodra er wat
              opduikt.
            </div>
          </div>
        ) : (
          <div className="table-empty">
            Geen {tab === "approved" ? "goedgekeurde" : "afgewezen"}{" "}
            voorstellen.
          </div>
        )
      ) : (
        <div className="suggestions-grid">
          {suggestions.map((s) => {
            const t = triggerLabel[s.trigger_type] ?? {
              icon: "💡",
              text: s.trigger_type,
            };
            const sc = s.suggested_campaign;
            const isActing = actingId === s.id;
            const confidence = s.confidence_score
              ? Math.round(s.confidence_score * 100)
              : null;
            const impact = s.expected_impact ?? {};

            return (
              <div key={s.id} className="suggestion-card">
                {/* Header: trigger + urgency-dot */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div className="sg-trigger">
                    <span>{t.icon}</span>
                    <span>{t.text}</span>
                  </div>
                  {s.urgency && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: urgencyColor[s.urgency],
                        fontWeight: 500,
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: urgencyColor[s.urgency],
                        }}
                      />
                      {urgencyLabel[s.urgency]}
                    </div>
                  )}
                </div>

                <div className="sg-title">
                  {sc.name ?? "Campagne-voorstel"}
                </div>

                {(sc.subject || sc.caption || sc.body) && (
                  <div className="sg-body">
                    {sc.subject ?? sc.caption ?? sc.body}
                  </div>
                )}

                {/* Expected Impact box */}
                {(impact.extra_reservations || impact.extra_revenue_cents) && (
                  <div
                    style={{
                      background: "var(--bl)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--rs)",
                      padding: "10px 12px",
                      display: "flex",
                      gap: 16,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ color: "var(--tl)", fontSize: 10 }}>
                        Verwacht extra
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        +{impact.extra_reservations} reserveringen
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--tl)", fontSize: 10 }}>
                        Geschatte omzet
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        +{formatEuro(impact.extra_revenue_cents)}
                      </div>
                    </div>
                    {confidence !== null && (
                      <div style={{ marginLeft: "auto" }}>
                        <div style={{ color: "var(--tl)", fontSize: 10 }}>
                          Confidence
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {confidence}%
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reasoning */}
                {s.reasoning && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ts)",
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      padding: "6px 0",
                      borderTop: "1px solid var(--border-soft)",
                    }}
                  >
                    <strong style={{ fontStyle: "normal" }}>Waarom nú:</strong>{" "}
                    {s.reasoning}
                  </div>
                )}

                <div className="sg-meta">
                  {sc.type && (
                    <span className={typeChipClass(sc.type)}>{sc.type}</span>
                  )}
                  {sc.segment && <span className="sg-chip">{sc.segment}</span>}
                </div>

                {tab === "pending" && (
                  <div className="sg-actions">
                    <button
                      className="sg-btn primary"
                      onClick={() => act(s.id, "approved")}
                      disabled={isActing}
                    >
                      {isActing ? "Bezig..." : "Goedkeuren"}
                    </button>
                    <button className="sg-btn" disabled>
                      Aanpassen
                    </button>
                    <button
                      className="sg-btn danger"
                      onClick={() => act(s.id, "rejected")}
                      disabled={isActing}
                    >
                      Afwijzen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
