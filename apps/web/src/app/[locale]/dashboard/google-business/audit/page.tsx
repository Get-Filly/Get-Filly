"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import {
  fetchHealthLatest,
  fetchHealthHistory,
  runHealthAudit,
  type HealthSnapshotFull,
  type HealthSnapshot,
  type HealthFinding,
  type HealthCategory,
  type HealthSeverity,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * ============================================================
 * Health-score (vindbaarheid) — vervangt Profiel-audit per 2026-05-23
 * ============================================================
 *
 * Structuur:
 *   1. Score-banner met cirkel + headline + meta              (altijd)
 *   2. 4 sub-score-kaarten (SEO / GBP / Reviews / GEO)        (altijd)
 *   3. Tabs-bar met 5 tabs:
 *        - Overzicht      → acties-lijst + concurrenten + trend
 *        - Website-SEO    → SEO-findings + (later: keyword-suggesties)
 *        - Google Business→ GBP-findings + (later: alle Place-velden)
 *        - Reviews        → Reviews-findings + (later: sentiment)
 *        - AI-zichtbaarheid→ GEO-findings + per-prompt details (live nu)
 *
 * De data per tab komt uit dezelfde HealthSnapshotFull; we filteren
 * findings op category. Per categorie kunnen we straks extra metrics
 * tonen via runner-specifieke velden in finding.details.
 * ============================================================
 */

const SCORE_WEIGHTS: Record<HealthCategory, number> = {
  gbp: 30,
  seo: 25,
  reviews: 25,
  geo: 20,
};

// Mapt elke categorie/severity op een message-key binnen de namespace.
const CATEGORY_LABEL_KEYS: Record<HealthCategory, string> = {
  seo: "category.seo.label",
  gbp: "category.gbp.label",
  reviews: "category.reviews.label",
  geo: "category.geo.label",
};

const CATEGORY_DESC_KEYS: Record<HealthCategory, string> = {
  seo: "category.seo.desc",
  gbp: "category.gbp.desc",
  reviews: "category.reviews.desc",
  geo: "category.geo.desc",
};

const SEVERITY_LABEL_KEYS: Record<HealthSeverity, string> = {
  info: "severity.info",
  low: "severity.low",
  medium: "severity.medium",
  high: "severity.high",
  critical: "severity.critical",
};

const SEVERITY_VARIANTS: Record<
  HealthSeverity,
  "neutral" | "info" | "warning" | "danger" | "success"
> = {
  info: "info",
  low: "neutral",
  medium: "warning",
  high: "warning",
  critical: "danger",
};

type TabKey = "overview" | "seo" | "gbp" | "reviews" | "geo";

export default function HealthScorePage() {
  const t = useTranslations("dash_google_business_audit_page");
  const { active } = useRestaurant();
  const [snapshot, setSnapshot] = useState<HealthSnapshotFull | null>(null);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchHealthLatest(), fetchHealthHistory(12)])
      .then(([latest, hist]) => {
        if (cancelled) return;
        setSnapshot(latest);
        setHistory(hist);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("errors.unknown"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active?.id, t]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const fresh = await runHealthAudit();
      setSnapshot(fresh);
      setHistory((prev) => {
        const { findings: _f, competitors: _c, ...trendRow } = fresh;
        return [trendRow as HealthSnapshot, ...prev].slice(0, 12);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.unknown"));
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} />
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 120,
                background: "var(--surface-muted, #F4F0E8)",
                borderRadius: 12,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} />
        <EmptyState
          title={t("loadError.title")}
          description={error}
          action={<Button onClick={handleRun}>{t("loadError.retry")}</Button>}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} />
        <EmptyState
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={handleRun} disabled={running}>
              {running ? t("empty.running") : t("empty.start")}
            </Button>
          }
        />
      </div>
    );
  }

  // Tab-counts: aantal gefaalde checks per categorie. Helpt eigenaar
  // direct zien waar het meeste werk ligt.
  const failedByCategory = (cat: HealthCategory) =>
    snapshot.findings.filter((f) => f.category === cat && !f.passed).length;

  const tabs: ReadonlyArray<TabItem<TabKey>> = [
    { key: "overview", label: t("tabs.overview") },
    {
      key: "seo",
      label: t("tabs.seo"),
      count: failedByCategory("seo") || undefined,
    },
    {
      key: "gbp",
      label: t("tabs.gbp"),
      count: failedByCategory("gbp") || undefined,
    },
    {
      key: "reviews",
      label: t("tabs.reviews"),
      count: failedByCategory("reviews") || undefined,
    },
    {
      key: "geo",
      label: t("tabs.geo"),
      count: failedByCategory("geo") || undefined,
    },
  ];

  return (
    <div className="page-full">
      <PageHeader
        title={t("title")}
        actions={
          <Button
            variant="brand-soft"
            onClick={handleRun}
            disabled={running}
          >
            {running ? t("rerun.running") : t("rerun.label")}
          </Button>
        }
      />

      {error && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            background: "var(--danger-soft, #FEE2E2)",
            border: "1px solid var(--danger, #DC2626)",
            borderRadius: 8,
            color: "var(--danger, #DC2626)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <ScoreBanner snapshot={snapshot} historyCount={history.length} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--space-3)",
          marginTop: "var(--space-4)",
        }}
      >
        <SubScoreCard category="seo" score={snapshot.scoreSeo} />
        <SubScoreCard category="gbp" score={snapshot.scoreGbp} />
        <SubScoreCard category="reviews" score={snapshot.scoreReviews} />
        <SubScoreCard category="geo" score={snapshot.scoreGeo} />
      </div>

      {/* Tabs-bar */}
      <div style={{ marginTop: "var(--space-5)" }}>
        <Tabs<TabKey>
          items={tabs}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab-inhoud */}
      <div style={{ marginTop: "var(--space-3)" }}>
        {activeTab === "overview" && (
          <OverviewTab snapshot={snapshot} history={history} />
        )}
        {activeTab === "seo" && <SeoTab snapshot={snapshot} />}
        {activeTab === "gbp" && <GbpTab snapshot={snapshot} />}
        {activeTab === "reviews" && <ReviewsTab snapshot={snapshot} />}
        {activeTab === "geo" && <GeoTab snapshot={snapshot} />}
      </div>
    </div>
  );
}

// ============================================================
// Tab: Overzicht (acties-lijst + concurrenten + trend)
// ============================================================

function OverviewTab({
  snapshot,
  history,
}: {
  snapshot: HealthSnapshotFull;
  history: HealthSnapshot[];
}) {
  return (
    <>
      <FindingsList findings={snapshot.findings} />
      {snapshot.competitors.length > 0 && (
        <CompetitorTable
          snapshot={snapshot}
          competitors={snapshot.competitors}
        />
      )}
      {history.length >= 2 && <TrendChart history={history} />}
    </>
  );
}

// ============================================================
// Tab: Website-SEO (categorie-deep-dive)
// ============================================================

function SeoTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const t = useTranslations("dash_google_business_audit_page");
  const seoFindings = snapshot.findings.filter((f) => f.category === "seo");

  return (
    <div>
      <CategoryHeader
        category="seo"
        score={snapshot.scoreSeo}
        intro={t("seoTab.intro")}
      />
      <ComingSoonNote text={t("seoTab.comingSoon")} />
      <CategoryFindings findings={seoFindings} />
    </div>
  );
}

// ============================================================
// Tab: Google Business (categorie-deep-dive)
// ============================================================

function GbpTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const t = useTranslations("dash_google_business_audit_page");
  const gbpFindings = snapshot.findings.filter((f) => f.category === "gbp");

  return (
    <div>
      <CategoryHeader
        category="gbp"
        score={snapshot.scoreGbp}
        intro={t("gbpTab.intro")}
      />
      <ComingSoonNote text={t("gbpTab.comingSoon")} />
      <CategoryFindings findings={gbpFindings} />
    </div>
  );
}

// ============================================================
// Tab: Reviews (categorie-deep-dive)
// ============================================================

function ReviewsTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const t = useTranslations("dash_google_business_audit_page");
  const reviewsFindings = snapshot.findings.filter(
    (f) => f.category === "reviews",
  );

  return (
    <div>
      <CategoryHeader
        category="reviews"
        score={snapshot.scoreReviews}
        intro={t("reviewsTab.intro")}
      />
      <ComingSoonNote text={t("reviewsTab.comingSoon")} />
      <CategoryFindings findings={reviewsFindings} />
    </div>
  );
}

// ============================================================
// Tab: GEO / AI-zichtbaarheid (categorie-deep-dive, met per-prompt details)
// ============================================================

function GeoTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const t = useTranslations("dash_google_business_audit_page");
  const geoFindings = snapshot.findings.filter((f) => f.category === "geo");
  // Split: summary-finding bovenaan, dan per-prompt-findings.
  const summary = geoFindings.find((f) => f.checkKey === "geo.summary");
  const promptFindings = geoFindings.filter((f) =>
    f.checkKey.startsWith("geo.prompt."),
  );

  return (
    <div>
      <CategoryHeader
        category="geo"
        score={snapshot.scoreGeo}
        intro={t("geoTab.intro")}
      />

      {summary && (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <CardBody>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
                color: "var(--text, #18181B)",
              }}
            >
              {summary.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.6,
                marginBottom: summary.fixSuggestion ? 12 : 0,
              }}
            >
              {summary.description}
            </div>
            {summary.fixSuggestion && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text, #18181B)",
                  padding: "var(--space-2)",
                  background: "var(--surface-muted, #F4F0E8)",
                  borderRadius: 6,
                }}
              >
                <strong>{t("geoTab.approachLabel")} </strong>
                {summary.fixSuggestion}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          marginBottom: "var(--space-2)",
          color: "var(--text, #18181B)",
        }}
      >
        {t("geoTab.perQuery")}
      </div>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {promptFindings.map((f) => (
          <GeoPromptCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

function GeoPromptCard({ finding }: { finding: HealthFinding }) {
  const t = useTranslations("dash_google_business_audit_page");
  const details = finding.details ?? {};
  const rank = (details as { rank?: number }).rank ?? 0;
  const totalListed = (details as { totalListed?: number }).totalListed ?? 0;
  const rawSnippet = (details as { rawSnippet?: string }).rawSnippet ?? "";

  return (
    <Card>
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "var(--text, #18181B)",
              }}
            >
              {finding.title}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {rank > 0 ? (
                <Badge variant="success">{t("geoTab.position", { rank })}</Badge>
              ) : (
                <Badge variant="warning">{t("geoTab.notMentioned")}</Badge>
              )}
              {totalListed > 0 && (
                <Badge variant="neutral">
                  {t("geoTab.restaurantsInAnswer", { count: totalListed })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {rawSnippet && (
          <details style={{ marginTop: 8 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              {t("geoTab.viewFullAnswer")}
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: "var(--space-2)",
                background: "var(--surface-muted, #F4F0E8)",
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                color: "var(--text, #18181B)",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {rawSnippet}
            </pre>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

// ============================================================
// Shared componenten voor de category-tabs
// ============================================================

function CategoryHeader({
  category,
  score,
  intro,
}: {
  category: HealthCategory;
  score: number;
  intro: string;
}) {
  const t = useTranslations("dash_google_business_audit_page");
  return (
    <Card style={{ marginBottom: "var(--space-4)" }}>
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBottom: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text, #18181B)",
                marginBottom: 4,
              }}
            >
              {t(CATEGORY_LABEL_KEYS[category])}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              {t("categoryHeader.weight", { weight: SCORE_WEIGHTS[category] })}
            </div>
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: scoreColor(score),
              lineHeight: 1,
            }}
          >
            {score}
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          {intro}
        </div>
      </CardBody>
    </Card>
  );
}

function ComingSoonNote({ text }: { text: string }) {
  const t = useTranslations("dash_google_business_audit_page");
  return (
    <div
      style={{
        padding: "var(--space-3)",
        background: "var(--info-soft, #DBEAFE)",
        borderRadius: 8,
        marginBottom: "var(--space-4)",
        fontSize: 12,
        color: "var(--text-secondary, #52525B)",
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: "var(--text, #18181B)" }}>
        {t("comingSoon.label")}{" "}
      </strong>
      {text}
    </div>
  );
}

function CategoryFindings({ findings }: { findings: HealthFinding[] }) {
  const t = useTranslations("dash_google_business_audit_page");
  // Sortering: gefaald eerst (op punten desc), dan geslaagd.
  const sorted = [...findings].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1;
    return b.pointsLost - a.pointsLost;
  });

  const failed = sorted.filter((f) => !f.passed);
  const passed = sorted.filter((f) => f.passed);

  return (
    <div>
      {failed.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-2)",
            }}
          >
            {t("findings.actionItems", { count: failed.length })}
          </div>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {failed.map((f) => (
              <FindingRow key={f.id} finding={f} showCategory={false} />
            ))}
          </div>
        </div>
      )}

      {passed.length > 0 && (
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-2)",
            }}
          >
            {t("findings.inOrder", { count: passed.length })}
          </div>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {passed.map((f) => (
              <PassedFindingRow key={f.id} finding={f} />
            ))}
          </div>
        </div>
      )}

      {failed.length === 0 && passed.length === 0 && (
        <EmptyState
          title={t("findings.noChecks.title")}
          description={t("findings.noChecks.description")}
        />
      )}
    </div>
  );
}

function PassedFindingRow({ finding }: { finding: HealthFinding }) {
  const t = useTranslations("dash_google_business_audit_page");
  return (
    <Card>
      <CardBody>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <Badge variant="success" withDot>{t("findings.ok")}</Badge>
          <div
            style={{
              fontSize: 14,
              color: "var(--text, #18181B)",
              flex: 1,
            }}
          >
            {finding.title}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ============================================================
// 1. ScoreBanner — grote cirkel + meta
// ============================================================

function ScoreBanner({
  snapshot,
  historyCount,
}: {
  snapshot: HealthSnapshotFull;
  historyCount: number;
}) {
  const t = useTranslations("dash_google_business_audit_page");
  const score = snapshot.scoreTotal;
  const color = scoreColor(score);
  const ranAt = new Date(snapshot.ranAt);
  const ranAtStr = ranAt.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card elevated>
      <CardBody>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              position: "relative",
              width: 160,
              height: 160,
              flexShrink: 0,
            }}
          >
            <ScoreCircle score={score} color={color} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  color,
                  lineHeight: 1,
                }}
              >
                {score}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  marginTop: 4,
                }}
              >
                {t("banner.outOf")}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "var(--text, #18181B)",
                marginBottom: 8,
              }}
            >
              {t(scoreHeadlineKey(score))}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.6,
                marginBottom: 12,
              }}
            >
              {t(scoreDescriptionKey(score))}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              {t("banner.lastAudit", { date: ranAtStr })}
              {historyCount > 1 &&
                ` · ${t("banner.runsInHistory", { count: historyCount })}`}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ScoreCircle({ score, color }: { score: number; color: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle
        cx={80}
        cy={80}
        r={radius}
        fill="none"
        stroke="var(--surface-muted, #F4F0E8)"
        strokeWidth={12}
      />
      <circle
        cx={80}
        cy={80}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 80 80)"
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success, #16A34A)";
  if (score >= 60) return "var(--warning, #D97706)";
  if (score >= 40) return "var(--warning, #D97706)";
  return "var(--danger, #DC2626)";
}

function scoreHeadlineKey(score: number): string {
  if (score >= 80) return "scoreHeadline.strong";
  if (score >= 60) return "scoreHeadline.good";
  if (score >= 40) return "scoreHeadline.room";
  return "scoreHeadline.work";
}

function scoreDescriptionKey(score: number): string {
  if (score >= 80) return "scoreDescription.strong";
  if (score >= 60) return "scoreDescription.good";
  if (score >= 40) return "scoreDescription.room";
  return "scoreDescription.work";
}

function SubScoreCard({
  category,
  score,
}: {
  category: HealthCategory;
  score: number;
}) {
  const t = useTranslations("dash_google_business_audit_page");
  const color = scoreColor(score);

  return (
    <Card>
      <CardBody>
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
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text, #18181B)",
            }}
          >
            {t(CATEGORY_LABEL_KEYS[category])}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary, #52525B)" }}>
            {SCORE_WEIGHTS[category]}%
          </div>
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color,
            lineHeight: 1,
            marginBottom: 6,
          }}
        >
          {score}
        </div>
        <div
          style={{
            height: 4,
            background: "var(--surface-muted, #F4F0E8)",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: `${score}%`,
              height: "100%",
              background: color,
              transition: "width 600ms ease",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            lineHeight: 1.4,
          }}
        >
          {t(CATEGORY_DESC_KEYS[category])}
        </div>
      </CardBody>
    </Card>
  );
}

function FindingsList({ findings }: { findings: HealthFinding[] }) {
  const t = useTranslations("dash_google_business_audit_page");
  const failed = findings
    .filter((f) => !f.passed)
    .sort((a, b) => b.pointsLost - a.pointsLost);

  if (failed.length === 0) {
    return (
      <Card style={{ marginTop: "var(--space-4)" }}>
        <CardBody>
          <div
            style={{
              padding: "var(--space-4)",
              textAlign: "center",
              color: "var(--text-secondary, #52525B)",
              fontSize: 14,
            }}
          >
            {t("overview.noActions")}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text, #18181B)",
          marginBottom: "var(--space-3)",
        }}
      >
        {t("overview.actionsThatRaise", { count: failed.length })}
      </div>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {failed.map((f) => (
          <FindingRow key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  showCategory = true,
}: {
  finding: HealthFinding;
  showCategory?: boolean;
}) {
  const t = useTranslations("dash_google_business_audit_page");
  return (
    <Card>
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBottom: 6,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "var(--text, #18181B)",
                marginBottom: 4,
              }}
            >
              {finding.title}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {showCategory && (
                <Badge variant="neutral">
                  {t(CATEGORY_LABEL_KEYS[finding.category])}
                </Badge>
              )}
              <Badge variant={SEVERITY_VARIANTS[finding.severity]}>
                {t(SEVERITY_LABEL_KEYS[finding.severity])}
              </Badge>
              {finding.pointsLost > 0 && (
                <Badge variant="neutral">
                  {t("findingRow.pointsPossible", { points: finding.pointsLost })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {finding.description && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
              marginTop: 6,
            }}
          >
            {finding.description}
          </div>
        )}
        {finding.fixSuggestion && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text, #18181B)",
              lineHeight: 1.5,
              marginTop: 8,
              padding: "var(--space-2)",
              background: "var(--surface-muted, #F4F0E8)",
              borderRadius: 6,
            }}
          >
            <strong>{t("findingRow.fix")} </strong>
            {finding.fixSuggestion}
            {finding.fixLink && (
              <>
                {" "}
                <Link
                  href={finding.fixLink}
                  style={{ color: "var(--brand, #004B23)" }}
                >
                  {t("findingRow.goThere")}
                </Link>
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function CompetitorTable({
  snapshot,
  competitors,
}: {
  snapshot: HealthSnapshotFull;
  competitors: HealthSnapshotFull["competitors"];
}) {
  const t = useTranslations("dash_google_business_audit_page");
  const top5 = competitors.slice(0, 5);

  return (
    <div style={{ marginTop: "var(--space-5)" }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text, #18181B)",
          marginBottom: "var(--space-3)",
        }}
      >
        {t("competitors.title")}
      </div>
      <Card>
        <CardBody style={{ padding: 0 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-muted, #F4F0E8)",
                  textAlign: "left",
                }}
              >
                <th style={cellStyle(true)}>#</th>
                <th style={cellStyle(true)}>{t("competitors.name")}</th>
                <th style={cellStyle(true)}>{t("competitors.distance")}</th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>
                  {t("competitors.gbp")}
                </th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>
                  {t("competitors.reviews")}
                </th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>
                  {t("competitors.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--brand-soft, #DCFCE7)" }}>
                <td style={cellStyle(false)}>—</td>
                <td style={{ ...cellStyle(false), fontWeight: 600 }}>
                  {t("competitors.yourRestaurant")}
                </td>
                <td style={cellStyle(false)}>0m</td>
                <td style={{ ...cellStyle(false), textAlign: "right" }}>
                  {snapshot.scoreGbp}
                </td>
                <td style={{ ...cellStyle(false), textAlign: "right" }}>
                  {snapshot.scoreReviews}
                </td>
                <td
                  style={{
                    ...cellStyle(false),
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {snapshot.scoreTotal}
                </td>
              </tr>
              {top5.map((c) => (
                <tr key={c.id}>
                  <td style={cellStyle(false)}>{c.rankInRadius}</td>
                  <td style={cellStyle(false)}>{c.name}</td>
                  <td style={cellStyle(false)}>{c.distanceM}m</td>
                  <td style={{ ...cellStyle(false), textAlign: "right" }}>
                    {c.scoreGbp ?? "—"}
                  </td>
                  <td style={{ ...cellStyle(false), textAlign: "right" }}>
                    {c.scoreReviews ?? "—"}
                  </td>
                  <td
                    style={{
                      ...cellStyle(false),
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {c.scoreTotal ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function cellStyle(isHeader: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border, #E4E4E7)",
    fontWeight: isHeader ? 600 : 400,
    color: isHeader
      ? "var(--text-secondary, #52525B)"
      : "var(--text, #18181B)",
  };
}

function TrendChart({ history }: { history: HealthSnapshot[] }) {
  const t = useTranslations("dash_google_business_audit_page");
  const ordered = [...history].reverse();
  const width = 600;
  const height = 120;
  const padding = 24;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const xStep = ordered.length > 1 ? innerW / (ordered.length - 1) : 0;
  const points = ordered.map((s, i) => {
    const x = padding + i * xStep;
    const y = padding + innerH * (1 - s.scoreTotal / 100);
    return { x, y, score: s.scoreTotal, date: s.ranAt };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div style={{ marginTop: "var(--space-5)" }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text, #18181B)",
          marginBottom: "var(--space-3)",
        }}
      >
        {t("trend.title", { count: ordered.length })}
      </div>
      <Card>
        <CardBody>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            {[0, 50, 100].map((v) => {
              const y = padding + innerH * (1 - v / 100);
              return (
                <line
                  key={v}
                  x1={padding}
                  x2={width - padding}
                  y1={y}
                  y2={y}
                  stroke="var(--border, #E4E4E7)"
                  strokeDasharray={v === 50 ? "2 4" : undefined}
                />
              );
            })}
            <path
              d={pathD}
              fill="none"
              stroke="var(--brand, #004B23)"
              strokeWidth={2}
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3}
                fill="var(--brand, #004B23)"
              />
            ))}
          </svg>
        </CardBody>
      </Card>
    </div>
  );
}
