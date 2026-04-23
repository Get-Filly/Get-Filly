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
  // Bewaart alle Filly-varianten PER REVIEW, op page-niveau dus niet
  // in de modal. Bewust: als de user per ongeluk naast de modal klikt
  // zijn de gegenereerde voorstellen (en de bijbehorende Claude-kosten)
  // niet weg. Ze blijven staan tot de user een reactie verstuurt —
  // dan wissen we ze pas. Page-refresh wist wel, dat vinden we prima:
  // rate-limit op de server (100/uur) is de echte bescherming.
  const [variantsByReview, setVariantsByReview] = useState<
    Record<string, string[]>
  >({});
  // Afgeleide waarde: de varianten voor de nu-open review. Pure helper
  // om de JSX leesbaar te houden.
  const variants = replyTo ? (variantsByReview[replyTo.id] ?? []) : [];
  // Status van de AI-call en van het opslaan. We splitsen deze bewust
  // uit zodat de knoppen onafhankelijk van elkaar een loading-state
  // kunnen tonen (genereren vs. versturen).
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Max 3 Filly-voorstellen per review-sessie. Klikt user modal weg
  // en opent 'm opnieuw voor dezelfde review? Dan wordt de teller
  // gereset — dat is bewust: elke "sessie" krijgt 3 kansen, niet
  // levenslang 3 per review. Abuse op rij-niveau vangen we al af
  // met de server-side rate-limit (100/uur/restaurant).
  const MAX_VARIANTS = 3;

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
    // We openen de modal en pakken eventueel eerder gegenereerde
    // varianten terug (bv. user heeft modal per ongeluk weggeklikt).
    // Tekstveld default: laatst gekozen variant indien aanwezig,
    // anders leeg. Filly wordt alleen aangeroepen op expliciet verzoek
    // — we verspillen geen Claude-tokens op openen alleen.
    setReplyTo(r);
    const existing = variantsByReview[r.id] ?? [];
    setReplyText(existing[existing.length - 1] ?? "");
    setError(null);
  };

  // Vraagt Filly om een suggestie. Nieuwe variant wordt toegevoegd aan
  // de per-review-lijst EN direct in het tekstveld gezet zodat de user
  // 'm meteen kan bewerken.
  const requestFillySuggestion = async () => {
    if (!replyTo) return;
    if (variants.length >= MAX_VARIANTS) return; // Dubbele bescherming
    setGenerating(true);
    setError(null);
    try {
      const { suggestion } = await generateReviewReply(replyTo.id);
      setVariantsByReview((prev) => ({
        ...prev,
        [replyTo.id]: [...(prev[replyTo.id] ?? []), suggestion],
      }));
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

  // Klikken op een variant in de kiezer = dat voorstel overnemen in
  // het tekstveld (overschrijft wat er stond).
  const pickVariant = (text: string) => {
    setReplyText(text);
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
      // Opgeruimd: varianten voor deze review hebben we niet meer
      // nodig, de reactie is definitief verstuurd.
      setVariantsByReview((prev) => {
        const next = { ...prev };
        delete next[replyTo.id];
        return next;
      });
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

            {/* Filly-banner: tot MAX_VARIANTS voorstellen kan de user
                laten genereren. Daarna verdwijnt de knop en krijgt de
                user een kiezer tussen de 3 varianten. */}
            {variants.length < MAX_VARIANTS ? (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>
                    {variants.length === 0
                      ? "Laat Filly een antwoord schrijven?"
                      : "Filly heeft een voorstel gedaan."}
                  </strong>{" "}
                  {variants.length === 0
                    ? "Of tik zelf rechtstreeks in het veld hieronder."
                    : `Pas het aan, of probeer nog een variant (${variants.length}/${MAX_VARIANTS}).`}
                </div>
                <button
                  className="sg-btn"
                  onClick={requestFillySuggestion}
                  disabled={generating}
                >
                  {generating
                    ? "Filly denkt na…"
                    : variants.length === 0
                      ? "Laat Filly schrijven"
                      : "Nog een variant"}
                </button>
              </div>
            ) : (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>Je hebt {MAX_VARIANTS} voorstellen gehad.</strong>{" "}
                  Kies hieronder je favoriet en pas 'm naar wens aan.
                </div>
              </div>
            )}

            {/* Kiezer: alleen zichtbaar zodra er meerdere varianten zijn.
                Klik op een kaartje = tekstveld wordt overschreven. Het
                actieve kaartje (= wat in het veld staat) markeren we
                met een brand-groene rand zodat het duidelijk is. */}
            {variants.length > 1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${variants.length}, 1fr)`,
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {variants.map((v, i) => {
                  const active = v === replyText;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickVariant(v)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        border: active
                          ? "2px solid var(--brand, #1F4A2D)"
                          : "1px solid var(--border, #ddd)",
                        borderRadius: 8,
                        background: active
                          ? "var(--brand-soft, #eef3ee)"
                          : "var(--surface, #fff)",
                        cursor: "pointer",
                        fontSize: 12,
                        lineHeight: 1.45,
                        color: "var(--text)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: active ? "var(--brand, #1F4A2D)" : "var(--muted, #666)",
                        }}
                      >
                        Variant {i + 1}
                        {active ? " · gekozen" : ""}
                      </div>
                      {/* Snippet — eerste ~120 tekens zodat 3 kaartjes
                          naast elkaar passen zonder te veel te schreeuwen. */}
                      {v.length > 120 ? v.slice(0, 120) + "…" : v}
                    </button>
                  );
                })}
              </div>
            )}

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
