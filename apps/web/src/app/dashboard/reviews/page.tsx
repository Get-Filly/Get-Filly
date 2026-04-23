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

// Sterren-component — goud-kleur (#F59E0B) is semantiek voor sterren en
// universeel herkenbaar. Bewust geen brand-kleur: gasten verwachten goud.
function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars">
      {"★".repeat(rating)}
      <span className="review-stars-empty">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Genereer een mock AI-antwoord dat Filly voorstelt voor een review.
 * Basis-logica: warm-bedankt bij positieve, empathisch-excuus bij
 * negatieve review. In productie komt dit uit Claude API met context
 * over de zaak (naam, toon, signature-gerechten).
 */
function buildFillyReply(r: Review): string {
  const author = r.author ?? "gast";
  if (r.rating >= 4) {
    return `Beste ${author},\n\nDank je wel voor je mooie review! Fijn om te horen dat je zo'n prettige ervaring had. We hopen je gauw weer te mogen verwelkomen.\n\nHartelijke groet,\nHet team`;
  }
  if (r.rating === 3) {
    return `Beste ${author},\n\nDank je voor je eerlijke feedback. We nemen je opmerkingen zeker mee en bespreken ze intern om de beleving volgende keer beter te maken.\n\nHartelijke groet,\nHet team`;
  }
  return `Beste ${author},\n\nAllereerst onze oprechte excuses dat je ervaring niet was zoals je had gehoopt. We nemen dit serieus en willen graag met je in gesprek om het goed te maken. Stuur een mail naar ons en we nemen snel contact op.\n\nHartelijke groet,\nHet team`;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("alle");
  // Modal-state: welke review wordt er beantwoord + de actuele tekst.
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    fetchReviews()
      .then((d) => {
        setReviews(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Escape sluit de reply-modal.
  useEffect(() => {
    if (!replyTo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReplyTo(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replyTo]);

  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return {
        avg: 0,
        total: 0,
        perSource: {} as Record<string, { count: number; avg: number }>,
        needsResponse: 0,
      };
    }
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

  const openReply = (r: Review) => {
    setReplyTo(r);
    setReplyText(buildFillyReply(r));
  };

  const useFillySuggestion = () => {
    if (replyTo) setReplyText(buildFillyReply(replyTo));
  };

  const sendReply = () => {
    // Mock: zet de review "gereageerd" in local state. Backend-call
    // komt later met PATCH /reviews/:id { response_text }.
    if (!replyTo) return;
    setReviews((prev) =>
      prev.map((r) =>
        r.id === replyTo.id ? { ...r, response_text: replyText } : r,
      ),
    );
    setReplyTo(null);
    setReplyText("");
  };

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
                <span className="review-stars-inline">★</span>
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
          <div
            className="stat-card-val"
            style={{
              color:
                !loading && stats.needsResponse > 0
                  ? "var(--red)"
                  : "var(--text)",
            }}
          >
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              stats.needsResponse
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
                {info.avg.toFixed(1)}{" "}
                <span className="review-stars-inline">★</span>{" "}
                <span className="review-source-count">({info.count})</span>
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
        <div className="review-list">
          {filtered.map((r) => {
            const src = sourceInfo[r.source];
            const needsResponse = r.rating <= 3 && !r.response_text;
            return (
              <div
                key={r.id}
                className={`review-card ${needsResponse ? "review-card-needs" : ""}`}
              >
                <div className="review-head">
                  <div>
                    <div className="review-meta-row">
                      <Stars rating={r.rating} />
                      <span className="review-source">
                        {src.icon} {src.label}
                      </span>
                      {needsResponse && (
                        <span className="review-urgency-pill">
                          Actie vereist
                        </span>
                      )}
                    </div>
                    {r.title && <div className="review-title">{r.title}</div>}
                  </div>
                  <div className="review-date">{formatDate(r.review_date)}</div>
                </div>
                {r.body && <div className="review-body">{r.body}</div>}
                <div className="review-foot">
                  <span className="review-author">— {r.author ?? "Anoniem"}</span>
                  {r.response_text ? (
                    <span className="review-responded">✓ Gereageerd</span>
                  ) : (
                    <button
                      className="sg-btn primary"
                      style={{ padding: "4px 14px", fontSize: 11 }}
                      onClick={() => openReply(r)}
                    >
                      Reageren
                    </button>
                  )}
                </div>
                {r.response_text && (
                  <div className="review-response">
                    <div className="review-response-label">Jouw reactie</div>
                    <div className="review-response-body">{r.response_text}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reply-modal — opent bij klik op "Reageren". Filly heeft een
          eerste voorstel geschreven, de gebruiker kan aanpassen of
          opnieuw laten genereren. */}
      {replyTo && (
        <div
          className="sg-modal-overlay"
          onClick={() => setReplyTo(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="sg-modal-close"
              onClick={() => setReplyTo(null)}
              aria-label="Sluiten"
            >
              ×
            </button>

            <div className="sg-modal-header">
              <div className="sg-trigger">
                <span>💬</span>
                <span>Reageren op review</span>
              </div>
            </div>

            <h2 className="sg-modal-title" style={{ fontSize: 18 }}>
              {sourceInfo[replyTo.source].label} · {replyTo.rating} ★
            </h2>

            {/* Originele review zichtbaar ter context. */}
            <div className="review-modal-original">
              <div className="review-modal-quote">
                {replyTo.title && <strong>{replyTo.title}. </strong>}
                {replyTo.body ?? "Geen inhoud."}
              </div>
              <div className="review-modal-author">
                — {replyTo.author ?? "Anoniem"} ·{" "}
                {formatDate(replyTo.review_date)}
              </div>
            </div>

            {/* Filly-banner: laat zien dat het antwoord door AI is
                voorgesteld. Gebruiker kan opnieuw laten genereren. */}
            <div className="review-modal-filly-banner">
              <div>
                <strong>Filly heeft een antwoord voorgesteld.</strong>{" "}
                Pas het aan zoals je wil — jij hebt de controle.
              </div>
              <button className="sg-btn" onClick={useFillySuggestion}>
                Opnieuw genereren
              </button>
            </div>

            <label className="review-modal-label">Jouw reactie</label>
            <textarea
              className="review-modal-textarea"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={8}
            />

            <div className="sg-actions sg-modal-actions">
              <button
                className="sg-btn primary"
                onClick={sendReply}
                disabled={!replyText.trim()}
              >
                Verstuur reactie
              </button>
              <button className="sg-btn" onClick={() => setReplyTo(null)}>
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
