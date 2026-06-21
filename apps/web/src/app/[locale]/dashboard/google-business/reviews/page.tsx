"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocaleTag } from "@/lib/locale-format";
import {
  fetchReviewVariants,
  fetchReviews,
  refineReviewVariants,
  saveReviewReply,
  type Review,
  type ReviewSource,
} from "@/lib/api";
import { Skeleton } from "../../_components/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { logger } from "@/lib/logger";

const sourceInfo: Record<ReviewSource, { label: string }> = {
  google: { label: "Google" },
  tripadvisor: { label: "TripAdvisor" },
  thefork: { label: "The Fork" },
  iens: { label: "IENS" },
};

type SourceFilter = "alle" | ReviewSource;

function formatDate(s: string | null, tag: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(tag, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Sterren-component, goud-kleur (#F59E0B) is semantiek voor sterren en
// universeel herkenbaar. Bewust geen brand-kleur: gasten verwachten goud.
function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars">
      {"★".repeat(rating)}
      <span className="review-stars-empty">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// Kleine trend-regel onder een KPI. Twee soorten:
//   - 'rating': delta in sterren (bv. "↑ 0,3 t.o.v. eerdere reviews").
//     Omhoog = beter = groen.
//   - 'volume': delta in aantal nieuwe reviews (bv. "↑ 2 nieuwe reviews
//     deze maand"). Meer = beter = groen.
// Toont niks bij null of bij een te klein verschil (ruis-onderdrukking).
function TrendBadge({
  trend,
  kind,
}: {
  trend: number | null;
  kind: "rating" | "volume";
}) {
  const t = useTranslations("dash_google_business_reviews_page");
  if (trend === null) return null;
  // Drempels: ratings pas vanaf 0,1 ster, volume vanaf 1 review.
  const minDelta = kind === "rating" ? 0.1 : 1;
  if (Math.abs(trend) < minDelta) return null;

  const up = trend > 0;
  const magnitude =
    kind === "rating"
      ? Math.abs(trend).toFixed(1)
      : String(Math.abs(Math.round(trend)));
  const label =
    kind === "rating"
      ? t("trendRatingLabel")
      : t("trendVolumeLabel", { count: Math.abs(Math.round(trend)) });

  return (
    <div
      style={{
        marginTop: 4,
        fontSize: 12,
        fontWeight: 500,
        color: up ? "var(--color-brand, #1F4A2D)" : "var(--red, #B91C1C)",
      }}
    >
      {up ? "↑" : "↓"} {magnitude} {label}
    </div>
  );
}

// Next.js 15+: `useSearchParams()` moet binnen een <Suspense>-boundary
// staan, anders weigert de production-build te prerenderen. Inner-component
// houdt de hooks; default-export wikkelt 'm in Suspense.
function ReviewsPageInner() {
  const t = useTranslations("dash_google_business_reviews_page");
  const localeTag = useLocaleTag();
  // Deep-link-support: andere pagina's kunnen linken naar
  // `/dashboard/google-business/reviews?openReply=<id>`. We lezen de
  // query-param hieronder en openen automatisch de reply-modal voor
  // die specifieke review + scrollen 'm in beeld.
  const searchParams = useSearchParams();
  const router = useRouter();
  const openReplyId = searchParams.get("openReply");
  // Ref bijhouden of we de auto-open al een keer hebben uitgevoerd
  // voor deze param-waarde, anders triggert 'ie bij elke re-render
  // opnieuw (en sluiten van de modal zou direct heropenen).
  const autoOpenedRef = useRef<string | null>(null);

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

  // ============================================================
  // Deep-link auto-open: ?openReply=<id>
  // ============================================================
  // Triggert na het laden van reviews (zodat we de juiste review uit
  // de lijst kunnen pakken). Doet 3 dingen:
  //   1. Filter resetten naar "alle" zodat de bron-filter de doel-
  //      review niet wegfiltert.
  //   2. Scroll de review-kaart in beeld + flash-highlight.
  //   3. openReply() aanroepen → modal + variant-generatie.
  // Daarna strippen we de query-param uit de URL zodat een refresh
  // niet onverwachts opnieuw de modal opent.
  useEffect(() => {
    if (!openReplyId) return;
    if (loading) return;
    if (autoOpenedRef.current === openReplyId) return;

    const target = reviews.find((r) => r.id === openReplyId);
    if (!target) {
      // Review niet in de lijst (verwijderd of niet meer zichtbaar
      // voor deze tenant). Stille fallback: param weghalen, gebruiker
      // ziet de algemene lijst.
      autoOpenedRef.current = openReplyId;
      router.replace("/dashboard/google-business/reviews");
      return;
    }

    autoOpenedRef.current = openReplyId;
    setFilter("alle");

    // Scroll + flash in de volgende frame, na DOM-render van de
    // huidige filter-state. Element-id staat op de review-card hieronder.
    requestAnimationFrame(() => {
      const el = document.getElementById(`review-${openReplyId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    void openReply(target);

    // URL opschonen: ?openReply= eruit halen zodat refresh / share-
    // link gedrag voorspelbaar blijft.
    router.replace("/dashboard/google-business/reviews");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReplyId, loading, reviews]);

  const stats = useMemo(() => {
    const emptyPerSource = {} as Record<
      string,
      { count: number; avg: number; trend: number | null }
    >;
    if (reviews.length === 0) {
      return {
        avg: 0,
        total: 0,
        perSource: emptyPerSource,
        needsResponse: 0,
        avgTrend: null as number | null,
        totalTrend: null as number | null,
      };
    }

    // Rating-trend: gemiddelde rating van de NIEUWSTE helft reviews
    // versus de OUDSTE helft (op review_date). Beantwoordt "worden onze
    // reviews beter?". Helft-vs-helft i.p.v. een vaste 30-dagen-window,
    // want dat blijft betekenisvol bij laag volume. Null onder 4 reviews
    // (te weinig om een trend op te baseren). Reviews zonder datum tellen
    // niet mee voor de chronologische split.
    const ratingTrend = (list: typeof reviews): number | null => {
      const dated = list.filter(
        (r): r is (typeof list)[number] & { review_date: string } =>
          !!r.review_date,
      );
      if (dated.length < 4) return null;
      const sorted = [...dated].sort(
        (a, b) =>
          new Date(a.review_date).getTime() -
          new Date(b.review_date).getTime(),
      );
      const half = Math.floor(sorted.length / 2);
      const older = sorted.slice(0, half);
      const newer = sorted.slice(sorted.length - half);
      const avgOf = (xs: typeof list) =>
        xs.reduce((s, r) => s + r.rating, 0) / xs.length;
      return avgOf(newer) - avgOf(older);
    };

    // Volume-trend (voor Totaal reviews): hoeveel reviews kwamen er in de
    // laatste 30 dagen binnen vs de 30 dagen daarvóór. We ankeren op de
    // NIEUWSTE review-datum i.p.v. "nu", zodat de trend ook klopt op een
    // demo-dataset waar de laatste review al een tijdje geleden is.
    // Positief = meer nieuwe reviews = goed.
    const volumeTrend = (list: typeof reviews): number | null => {
      const dated = list.filter((r) => !!r.review_date);
      if (dated.length < 2) return null;
      const times = dated.map((r) =>
        new Date(r.review_date as string).getTime(),
      );
      const anchor = Math.max(...times);
      const DAY = 86_400_000;
      const recent = times.filter(
        (t) => t > anchor - 30 * DAY,
      ).length;
      const previous = times.filter(
        (t) => t <= anchor - 30 * DAY && t > anchor - 60 * DAY,
      ).length;
      return recent - previous;
    };

    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const perSource: Record<
      string,
      { count: number; avg: number; trend: number | null }
    > = {};
    for (const r of reviews) {
      if (!perSource[r.source]) {
        perSource[r.source] = { count: 0, avg: 0, trend: null };
      }
      perSource[r.source].count++;
    }
    for (const src in perSource) {
      const sub = reviews.filter((r) => r.source === src);
      perSource[src].avg =
        sub.reduce((s, r) => s + r.rating, 0) / sub.length;
      perSource[src].trend = ratingTrend(sub);
    }
    const needsResponse = reviews.filter(
      (r) => r.rating <= 3 && !r.response_text,
    ).length;

    return {
      avg,
      total: reviews.length,
      perSource,
      needsResponse,
      avgTrend: ratingTrend(reviews),
      totalTrend: volumeTrend(reviews),
    };
  }, [reviews]);

  const filtered = useMemo(() => {
    if (filter === "alle") return reviews;
    return reviews.filter((r) => r.source === filter);
  }, [reviews, filter]);

  // Prioriteit: reviews die nog aandacht vragen (rating ≤ drempel én nog
  // geen reactie). Sortering: laagste rating eerst (meest urgent boven),
  // bij gelijke rating de nieuwste eerst. Respecteert de kanaal-filter.
  const priorityReviews = useMemo(() => {
    return filtered
      .filter((r) => r.rating <= 3 && !r.response_text)
      .sort((a, b) => {
        if (a.rating !== b.rating) return a.rating - b.rating;
        const ta = a.review_date ? new Date(a.review_date).getTime() : 0;
        const tb = b.review_date ? new Date(b.review_date).getTime() : 0;
        return tb - ta;
      });
  }, [filtered]);

  // Alle reviews op tijdsvolgorde, nieuwste eerst. Bevat óók de
  // prioriteit-reviews (die staan bovenaan als aparte sectie, maar
  // blijven ook in de complete tijdlijn zichtbaar — Floris-keuze).
  const sortedAll = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.review_date ? new Date(a.review_date).getTime() : 0;
      const tb = b.review_date ? new Date(b.review_date).getTime() : 0;
      return tb - ta;
    });
  }, [filtered]);

  const sourceFilters: SourceFilter[] = [
    "alle",
    ...(Object.keys(sourceInfo) as ReviewSource[]),
  ];

  const openReply = async (r: Review) => {
    // Modal openen + tekstveld leegmaken (niet auto-vullen met variant
    //, user kiest zelf welke 'ie wil hebben). Daarna fetchen we de
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
        e instanceof Error ? e.message : t("errors.generate"),
      );
      logger.error(e);
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
        e instanceof Error ? e.message : t("errors.generate"),
      );
      logger.error(e);
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
      // Vervang de review in state door wat de backend teruggeeft,
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
      setError(t("errors.save"));
      logger.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Eén review-kaart. Gebruikt in zowel de Prioriteit- als de Alle-sectie.
  // withId zet de DOM-id `review-<id>` voor de deep-link-scroll; we zetten
  // 'm ALLEEN op de Alle-sectie zodat een review die in beide secties
  // staat geen dubbele (ongeldige) HTML-id krijgt.
  const renderCard = (r: Review, withId: boolean) => {
    const src = sourceInfo[r.source];
    const needsResponse = r.rating <= 3 && !r.response_text;
    return (
      <div
        key={`${withId ? "all" : "prio"}-${r.id}`}
        id={withId ? `review-${r.id}` : undefined}
        className={`review-card ${needsResponse ? "review-card-needs" : ""}`}
      >
        <div className="review-head">
          <div>
            <div className="review-meta-row">
              <Stars rating={r.rating} />
              <span className="review-source">{src.label}</span>
              {needsResponse && (
                <span className="review-urgency-pill">{t("actionRequired")}</span>
              )}
            </div>
            {r.title && <div className="review-title">{r.title}</div>}
          </div>
          <div className="review-date">{formatDate(r.review_date, localeTag)}</div>
        </div>
        {r.body && <div className="review-body">{r.body}</div>}
        <div className="review-foot">
          <span className="review-author">{r.author ?? t("anonymous")}</span>
          {r.response_text ? (
            <span className="review-responded">{t("responded")}</span>
          ) : (
            <button
              className="sg-btn primary"
              style={{ padding: "4px 14px", fontSize: 11 }}
              onClick={() => openReply(r)}
            >
              {t("reply")}
            </button>
          )}
        </div>
        {r.response_text && (
          <div className="review-response">
            <div className="review-response-label">{t("yourReply")}</div>
            <div className="review-response-body">{r.response_text}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-full">
      <PageHeader title={t("title")} />

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">{t("statAverage")}</div>
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
          {!loading && <TrendBadge trend={stats.avgTrend} kind="rating" />}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statTotal")}</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.total}
          </div>
          {!loading && <TrendBadge trend={stats.totalTrend} kind="volume" />}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statNeedsResponse")}</div>
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
              {!loading && <TrendBadge trend={info.trend} kind="rating" />}
            </div>
          ))}
      </div>

      <Tabs
        items={sourceFilters.map((f) => ({
          key: f,
          label: f === "alle" ? t("filterAll") : sourceInfo[f].label,
        }))}
        active={filter}
        onChange={setFilter}
      />

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={100} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        // Volledig nieuwe klant: nog geen reviews binnen. Verwijs naar
        // de koppelingen-pagina voor Google Business / TripAdvisor.
        <EmptyState
          icon="⭐"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : filtered.length === 0 ? (
        <div className="table-empty">{t("emptyCategory")}</div>
      ) : (
        <>
          {/* Prioriteit-sectie: alleen tonen als er reviews aandacht
              vragen. Staat boven de complete tijdlijn zodat de eigenaar
              meteen ziet wat dringend is. */}
          {priorityReviews.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "8px 0 12px",
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text, #18181B)",
                    margin: 0,
                  }}
                >
                  {t("priorityHeading")}
                </h2>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--red, #B91C1C)",
                    background: "var(--red-soft, #FEE2E2)",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {priorityReviews.length}
                </span>
                <span style={{ fontSize: 12, color: "var(--tl)" }}>
                  {t("prioritySubtitle")}
                </span>
              </div>
              <div className="review-list">
                {priorityReviews.map((r) => renderCard(r, false))}
              </div>
            </div>
          )}

          {/* Alle reviews op tijdsvolgorde (nieuwste eerst). Bevat ook de
              prioriteit-reviews — de Prioriteit-sectie is een uitgelichte
              kopie bovenaan. */}
          <div>
            {priorityReviews.length > 0 && (
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text, #18181B)",
                  margin: "8px 0 12px",
                }}
              >
                {t("allReviewsHeading")}
              </h2>
            )}
            <div className="review-list">
              {sortedAll.map((r) => renderCard(r, true))}
            </div>
          </div>
        </>
      )}

      {/* Reply-modal, opent bij klik op "Reageren". Filly heeft een
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
              aria-label={t("close")}
            >
              ×
            </button>

            <div className="sg-modal-header">
              <div className="sg-trigger">
                <span>💬</span>
                <span>{t("modalTrigger")}</span>
              </div>
            </div>

            <h2 className="sg-modal-title" style={{ fontSize: 18 }}>
              {sourceInfo[replyTo.source].label} · {replyTo.rating} ★
            </h2>

            {/* Originele review zichtbaar ter context. */}
            <div className="review-modal-original">
              <div className="review-modal-quote">
                {replyTo.title && <strong>{replyTo.title}. </strong>}
                {replyTo.body ?? t("noContent")}
              </div>
              <div className="review-modal-author">
               , {replyTo.author ?? t("anonymous")} ·{" "}
                {formatDate(replyTo.review_date, localeTag)}
              </div>
            </div>

            {/* Filly-banner met dynamische copy + regenerate-knop.
                Vanaf modal-open: 3 voorstellen worden automatisch
                gecached en getoond. Knop "Genereer 3 nieuwe" voegt
                3 extra toe (totaal 6). Daarna disabled,
                kostenbeheersing. Server cachet alles per review. */}
            {bootstrapping ? (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>{t("bannerLoadingTitle")}</strong>{" "}
                  {t("bannerLoadingBody")}
                </div>
              </div>
            ) : canRegenerate ? (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>
                    {variants.length === 0
                      ? t("bannerWritingTitle")
                      : t("bannerWrittenTitle", { count: variants.length })}
                  </strong>{" "}
                  {variants.length === 0
                    ? t("bannerWritingBody")
                    : regenCount === 1
                      ? t("bannerPickOrRegen")
                      : t("bannerPickOnly")}
                </div>
                {variants.length > 0 && (
                  <button
                    className="sg-btn"
                    onClick={requestFillySuggestion}
                    disabled={generating}
                  >
                    {generating ? t("thinking") : t("generateThreeNew")}
                  </button>
                )}
              </div>
            ) : (
              <div className="review-modal-filly-banner">
                <div>
                  <strong>{t("bannerMaxTitle", { count: variants.length })}</strong>{" "}
                  {t("bannerMaxBody")}
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
                  // Auto-fit met min 180px per card, bij 3 varianten
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
                        {t("variantLabel", { number: i + 1 })}
                        {active ? t("variantChosenSuffix") : ""}
                      </div>
                      {/* Snippet, eerste ~120 tekens zodat 3 kaartjes
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

            <label className="review-modal-label">{t("yourReply")}</label>
            <textarea
              className="review-modal-textarea"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={8}
              placeholder={t("replyPlaceholder")}
            />

            <div className="sg-actions sg-modal-actions">
              <button
                className="sg-btn primary"
                onClick={sendReply}
                disabled={!replyText.trim() || saving}
              >
                {saving ? t("saving") : t("sendReply")}
              </button>
              <button
                className="sg-btn"
                onClick={() => setReplyTo(null)}
                disabled={saving}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={null}>
      <ReviewsPageInner />
    </Suspense>
  );
}
