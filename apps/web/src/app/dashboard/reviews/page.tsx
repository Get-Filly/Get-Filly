"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchReviewVariants,
  fetchReviews,
  refineReviewVariants,
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
  // Filly-varianten + regen-count PER REVIEW. State leeft op page-
  // niveau zodat een per-ongeluk-weggeklikte modal de cache niet
  // weggooit; we cachen óók server-side in reviews.filly_variants
  // dus deze state is in essentie een mirror van de DB voor snelle
  // UI-renders.
  const [variantsByReview, setVariantsByReview] = useState<
    Record<
      string,
      {
        variants: string[];
        regenerate_count: number;
        can_regenerate: boolean;
      }
    >
  >({});
  // Afgeleide waarden voor de nu-open review.
  const reviewState = replyTo ? variantsByReview[replyTo.id] : undefined;
  const variants = reviewState?.variants ?? [];
  const regenCount = reviewState?.regenerate_count ?? 0;
  const canRegenerate = reviewState?.can_regenerate ?? true;
  // Status van de AI-call en van het opslaan. We splitsen deze bewust
  // uit zodat de knoppen onafhankelijk van elkaar een loading-state
  // kunnen tonen (genereren vs. versturen).
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

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

  const openReply = async (r: Review) => {
    // Modal openen + tekstveld leegmaken (niet auto-vullen met variant
    // — user kiest zelf welke 'ie wil hebben). Daarna fetchen we de
    // gecachte set; als die leeg is, genereren we automatisch 3.
    setReplyTo(r);
    setReplyText("");
    setError(null);

    // Als we al state hebben in geheugen (modal-toggle binnen sessie):
    // hoeft niet opnieuw te fetchen. Anders: fetch DB-cache.
    if (variantsByReview[r.id]) return;

    setBootstrapping(true);
    try {
      const cache = await fetchReviewVariants(r.id);
      if (cache.variants.length > 0) {
        setVariantsByReview((prev) => ({ ...prev, [r.id]: cache }));
        setBootstrapping(false);
        return;
      }
      // Cache leeg → auto-genereer 3 zodat user direct iets ziet.
      setBootstrapping(false);
      setGenerating(true);
      const fresh = await refineReviewVariants(r.id);
      setVariantsByReview((prev) => ({ ...prev, [r.id]: fresh }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Filly kon geen voorstel maken. Probeer nog eens of tik zelf.",
      );
      console.error(e);
    } finally {
      setBootstrapping(false);
      setGenerating(false);
    }
  };

  // Klik "Genereer 3 nieuwe": 3 extra varianten erbij (totaal 6) +
  // regen_count→2. Daarna disabled. State leest backend zodat client +
  // server in sync blijven.
  const requestFillySuggestion = async () => {
    if (!replyTo || generating || !canRegenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await refineReviewVariants(replyTo.id);
      setVariantsByReview((prev) => ({ ...prev, [replyTo.id]: result }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Filly kon geen voorstel maken. Probeer nog eens of tik zelf.",
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

            {/* Filly-banner met dynamische copy + regenerate-knop.
                Vanaf modal-open: 3 voorstellen worden automatisch
                gecached en getoond. Knop "Genereer 3 nieuwe" voegt
                3 extra toe (totaal 6). Daarna disabled —
                kostenbeheersing. Server cachet alles per review. */}
            {bootstrapping ? (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>Filly bekijkt de review…</strong>{" "}
                  Laden van eerdere voorstellen of een nieuwe set.
                </div>
              </div>
            ) : canRegenerate ? (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>
                    {variants.length === 0
                      ? "Filly schrijft 3 voorstellen…"
                      : `Filly heeft ${variants.length} versies geschreven.`}
                  </strong>{" "}
                  {variants.length === 0
                    ? "Even geduld."
                    : regenCount === 1
                      ? "Klik op een versie of laat 3 nieuwe maken (max 6)."
                      : "Klik op een versie om 'm in het tekstveld te zetten."}
                </div>
                {variants.length > 0 && (
                  <button
                    className="sg-btn"
                    onClick={requestFillySuggestion}
                    disabled={generating}
                  >
                    {generating ? "Filly denkt na…" : "↻ Genereer 3 nieuwe"}
                  </button>
                )}
              </div>
            ) : (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>{variants.length} versies klaar.</strong>{" "}
                  Maximum bereikt — kies hieronder je favoriet en pas
                  'm naar wens aan.
                </div>
              </div>
            )}

            {/* Kiezer: zichtbaar zodra er varianten zijn.
                Klik op een kaartje = tekstveld wordt overschreven. Het
                actieve kaartje (= wat in het veld staat) markeren we
                met een brand-groene rand zodat het duidelijk is. */}
            {variants.length > 0 && (
              <div
                style={{
                  display: "grid",
                  // Auto-fit met min 180px per card — bij 3 varianten
                  // krijg je 3 kolommen, bij 6 wordt het automatisch
                  // 2 of 3 rijen afhankelijk van modal-breedte.
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
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
