"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchReviews,
  generateReviewReply,
  saveReviewReply,
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

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("alle");
  // Modal-state: welke review wordt er beantwoord + de actuele tekst.
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");
  // Status van de AI-call en van het opslaan. We splitsen deze bewust
  // uit zodat de knoppen onafhankelijk van elkaar een loading-state
  // kunnen tonen (genereren vs. versturen).
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // We openen de modal met een leeg veld. Filly genereert alleen
    // als de gebruiker er om vraagt — zo verspillen we geen Claude-
    // tokens op reviews die de eigenaar zelf wil tikken.
    setReplyTo(r);
    setReplyText("");
    setError(null);
  };

  // Vraagt Filly om een suggestie en vult 'm in het tekstveld. Bij
  // falen tonen we een korte NL-melding; de user kan dan alsnog zelf
  // typen of opnieuw proberen.
  const requestFillySuggestion = async () => {
    if (!replyTo) return;
    setGenerating(true);
    setError(null);
    try {
      const { suggestion } = await generateReviewReply(replyTo.id);
      setReplyText(suggestion);
    } catch (e) {
      setError(
        "Filly kon geen voorstel maken. Probeer nog eens of tik zelf een antwoord.",
      );
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saveReviewReply(replyTo.id, replyText);
      // Vervang de review in state door wat de backend teruggeeft —
      // zo hebben we gegarandeerd dezelfde data als de server (incl.
      // responded_at-timestamp).
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReplyTo(null);
      setReplyText("");
    } catch (e) {
      setError("Opslaan is mislukt. Probeer nog eens.");
      console.error(e);
    } finally {
      setSaving(false);
    }
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

            {/* Filly-banner: je kunt 'm laten schrijven of opnieuw laten
                genereren als je het eerste voorstel niet raak vindt. */}
            <div className="review-modal-filly-banner">
              <div>
                <strong>
                  {replyText
                    ? "Filly heeft een antwoord voorgesteld."
                    : "Laat Filly een antwoord schrijven?"}
                </strong>{" "}
                {replyText
                  ? "Pas het aan zoals je wil — jij hebt de controle."
                  : "Of tik zelf rechtstreeks in het veld hieronder."}
              </div>
              <button
                className="sg-btn"
                onClick={requestFillySuggestion}
                disabled={generating}
              >
                {generating
                  ? "Filly denkt na…"
                  : replyText
                    ? "Opnieuw genereren"
                    : "Laat Filly schrijven"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  background: "var(--red-soft, #fee)",
                  color: "var(--red, #b00)",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <label className="review-modal-label">Jouw reactie</label>
            <textarea
              className="review-modal-textarea"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={8}
              placeholder="Tik hier je antwoord, of laat Filly een voorstel doen."
            />

            <div className="sg-actions sg-modal-actions">
              <button
                className="sg-btn primary"
                onClick={sendReply}
                disabled={!replyText.trim() || saving}
              >
                {saving ? "Opslaan…" : "Verstuur reactie"}
              </button>
              <button
                className="sg-btn"
                onClick={() => setReplyTo(null)}
                disabled={saving}
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
