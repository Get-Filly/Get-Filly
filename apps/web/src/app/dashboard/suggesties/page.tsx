"use client";

import { useEffect, useMemo, useState } from "react";
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

function typeChipClass(type?: string) {
  if (type === "mail") return "sg-chip type-mail";
  if (type === "social") return "sg-chip type-social";
  return "sg-chip";
}

function formatCtx(ctx: Record<string, unknown> | null): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.target_date) parts.push(`datum: ${ctx.target_date}`);
  if (ctx.current_occupancy_pct !== undefined)
    parts.push(`bezetting: ${ctx.current_occupancy_pct}%`);
  if (ctx.weather) parts.push(`weer: ${ctx.weather}`);
  if (ctx.upcoming_event) parts.push(`event: ${ctx.upcoming_event}`);
  if (ctx.segment) parts.push(`segment: ${ctx.segment}`);
  if (ctx.guest_count) parts.push(`gasten: ${ctx.guest_count}`);
  return parts.join(" · ");
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

  const counts = useMemo(() => {
    // Alleen huidige tab heeft echte count
    return { [tab]: suggestions.length };
  }, [suggestions, tab]);
  void counts;

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
        Voorstellen van Filly wachtend op jouw goedkeuring. Keur goed → wordt
        een echte campagne. Wijs af → Filly leert van je feedback.
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
              <Skeleton height={18} width="80%" />
              <Skeleton height={14} width="100%" />
              <Skeleton height={14} width="70%" />
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
              Geen nieuwe voorstellen wachtend op goedkeuring. Filly laat het
              weten zodra er iets belangrijks opduikt.
            </div>
          </div>
        ) : (
          <div className="table-empty">
            Geen {tab === "approved" ? "goedgekeurde" : "afgewezen"} voorstellen.
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
            const ctxText = formatCtx(s.trigger_context);
            const isActing = actingId === s.id;

            return (
              <div key={s.id} className="suggestion-card">
                <div className="sg-trigger">
                  <span>{t.icon}</span>
                  <span>{t.text}</span>
                </div>
                <div className="sg-title">{sc.name ?? "Campagne-voorstel"}</div>
                {(sc.subject || sc.caption || sc.body) && (
                  <div className="sg-body">
                    {sc.subject ?? sc.caption ?? sc.body}
                  </div>
                )}
                <div className="sg-meta">
                  {sc.type && (
                    <span className={typeChipClass(sc.type)}>{sc.type}</span>
                  )}
                  {sc.segment && <span className="sg-chip">{sc.segment}</span>}
                  {ctxText && <span className="sg-chip">{ctxText}</span>}
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
