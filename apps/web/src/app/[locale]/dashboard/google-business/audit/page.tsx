"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

const CATEGORY_LABELS: Record<HealthCategory, string> = {
  seo: "Website-SEO",
  gbp: "Google Business Profile",
  reviews: "Reviews",
  geo: "AI-zichtbaarheid",
};

const CATEGORY_DESCRIPTIONS: Record<HealthCategory, string> = {
  seo: "Title, meta-tags, schema.org, mobile, snelheid",
  gbp: "Profiel-compleetheid, foto's, openingstijden",
  reviews: "Aantal reviews, gemiddelde rating",
  geo: "Word je genoemd in AI-assistenten?",
};

const SEVERITY_LABELS: Record<HealthSeverity, string> = {
  info: "Info",
  low: "Klein",
  medium: "Gemiddeld",
  high: "Belangrijk",
  critical: "Kritiek",
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
        setError(err instanceof Error ? err.message : "Onbekende fout");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active?.id]);

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
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="page-full">
        <PageHeader title="Health-score" />
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
        <PageHeader title="Health-score" />
        <EmptyState
          title="Kon health-score niet laden"
          description={error}
          action={<Button onClick={handleRun}>Probeer opnieuw</Button>}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="page-full">
        <PageHeader title="Health-score" />
        <EmptyState
          title="Run je eerste health-audit"
          description="Filly checkt je website-SEO, Google Business Profile-kwaliteit, reviews, AI-zichtbaarheid en concurrentie in 500m straal. Duurt ongeveer een minuut."
          action={
            <Button onClick={handleRun} disabled={running}>
              {running ? "Bezig met audit…" : "Start eerste audit"}
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
    { key: "overview", label: "Overzicht" },
    {
      key: "seo",
      label: "Website-SEO",
      count: failedByCategory("seo") || undefined,
    },
    {
      key: "gbp",
      label: "Google Business",
      count: failedByCategory("gbp") || undefined,
    },
    {
      key: "reviews",
      label: "Reviews",
      count: failedByCategory("reviews") || undefined,
    },
    {
      key: "geo",
      label: "AI-zichtbaarheid",
      count: failedByCategory("geo") || undefined,
    },
  ];

  return (
    <div className="page-full">
      <PageHeader
        title="Health-score"
        actions={
          <Button
            variant="brand-soft"
            onClick={handleRun}
            disabled={running}
          >
            {running ? "Bezig…" : "Audit opnieuw"}
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
  const seoFindings = snapshot.findings.filter((f) => f.category === "seo");

  return (
    <div>
      <CategoryHeader
        category="seo"
        score={snapshot.scoreSeo}
        intro="We checken 15 deterministische SEO-signalen op je homepage plus drie Lighthouse-categorieën via Google PageSpeed Insights. Hieronder zie je elk gecontroleerd punt."
      />
      <ComingSoonNote text="Binnenkort hier ook: keyword-suggesties die Filly genereert voor je title, meta-description en H1 op basis van je keuken en stad." />
      <CategoryFindings findings={seoFindings} />
    </div>
  );
}

// ============================================================
// Tab: Google Business (categorie-deep-dive)
// ============================================================

function GbpTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const gbpFindings = snapshot.findings.filter((f) => f.category === "gbp");

  return (
    <div>
      <CategoryHeader
        category="gbp"
        score={snapshot.scoreGbp}
        intro="We checken 8 kerncriteria op je Google Business Profile: van bedrijfsstatus en compleetheid tot foto-volume en categorisering. Reviews zitten in een aparte tab."
      />
      <ComingSoonNote text="Binnenkort hier ook: een gedetailleerde checklist met alle Place-velden (telefoon, adres, openingstijden) met hun huidige waarde, zodat je in één oogopslag ziet wat klopt en wat ontbreekt." />
      <CategoryFindings findings={gbpFindings} />
    </div>
  );
}

// ============================================================
// Tab: Reviews (categorie-deep-dive)
// ============================================================

function ReviewsTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
  const reviewsFindings = snapshot.findings.filter(
    (f) => f.category === "reviews",
  );

  return (
    <div>
      <CategoryHeader
        category="reviews"
        score={snapshot.scoreReviews}
        intro="Reviews-gezondheid op basis van je Google-profiel: aantal, gemiddelde rating en thresholds (10+ en 30+) waar gasten-vertrouwen merkbaar kantelt."
      />
      <ComingSoonNote text="Binnenkort hier ook: sentiment-analyse op je review-tekst (welke onderwerpen positief, welke negatief). Voor de antwoord-ratio en review-recency wachten we op de Google Business Profile API-koppeling (OAuth)." />
      <CategoryFindings findings={reviewsFindings} />
    </div>
  );
}

// ============================================================
// Tab: GEO / AI-zichtbaarheid (categorie-deep-dive, met per-prompt details)
// ============================================================

function GeoTab({ snapshot }: { snapshot: HealthSnapshotFull }) {
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
        intro="We vragen Claude (Anthropic) vijf verschillende vragen over goede restaurants in jouw stad en kijken of jij genoemd wordt. Positie in de lijst telt mee: top-3 levert volle punten, lager in de lijst minder. Niet genoemd = 0 punten."
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
                <strong>Aanpak: </strong>
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
        Per zoekopdracht
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
                <Badge variant="success">Positie {rank}</Badge>
              ) : (
                <Badge variant="warning">Niet genoemd</Badge>
              )}
              {totalListed > 0 && (
                <Badge variant="neutral">{totalListed} restaurants in antwoord</Badge>
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
              Bekijk Claude's volledige antwoord
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
              {CATEGORY_LABELS[category]}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              Telt voor {SCORE_WEIGHTS[category]}% van je totaalscore
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
      <strong style={{ color: "var(--text, #18181B)" }}>Binnenkort: </strong>
      {text}
    </div>
  );
}

function CategoryFindings({ findings }: { findings: HealthFinding[] }) {
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
            Actiepunten ({failed.length})
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
            Op orde ({passed.length})
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
          title="Nog geen checks beschikbaar"
          description="Run de audit om resultaten te zien."
        />
      )}
    </div>
  );
}

function PassedFindingRow({ finding }: { finding: HealthFinding }) {
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
          <Badge variant="success" withDot>OK</Badge>
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
                / 100
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
              {scoreHeadline(score)}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.6,
                marginBottom: 12,
              }}
            >
              {scoreDescription(score)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              Laatste audit: {ranAtStr}
              {historyCount > 1 && ` · ${historyCount} runs in historie`}
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

function scoreHeadline(score: number): string {
  if (score >= 80) return "Sterke vindbaarheid";
  if (score >= 60) return "Goede basis, kan beter";
  if (score >= 40) return "Ruimte voor verbetering";
  return "Veel werk te doen";
}

function scoreDescription(score: number): string {
  if (score >= 80)
    return "Je vindbaarheid is op orde. Werk aan de laatste verbeterpunten in de tabs hieronder om je voorsprong uit te bouwen.";
  if (score >= 60)
    return "De basis is in orde, maar er liggen concrete kansen om hoger te scoren. Bekijk de tabs per categorie voor de details.";
  if (score >= 40)
    return "Er zijn flinke verbeteringen mogelijk. Focus op de kritieke acties (rood) voor de grootste impact.";
  return "Je vindbaarheid heeft veel aandacht nodig. De kritieke acties hieronder leveren direct de grootste sprong op.";
}

function SubScoreCard({
  category,
  score,
}: {
  category: HealthCategory;
  score: number;
}) {
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
            {CATEGORY_LABELS[category]}
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
          {CATEGORY_DESCRIPTIONS[category]}
        </div>
      </CardBody>
    </Card>
  );
}

function FindingsList({ findings }: { findings: HealthFinding[] }) {
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
            🎉 Geen actiepunten — alles ziet er goed uit.
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
        Acties die je score verhogen ({failed.length})
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
                  {CATEGORY_LABELS[finding.category]}
                </Badge>
              )}
              <Badge variant={SEVERITY_VARIANTS[finding.severity]}>
                {SEVERITY_LABELS[finding.severity]}
              </Badge>
              {finding.pointsLost > 0 && (
                <Badge variant="neutral">+{finding.pointsLost} pt mogelijk</Badge>
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
            <strong>Fix: </strong>
            {finding.fixSuggestion}
            {finding.fixLink && (
              <>
                {" "}
                <Link
                  href={finding.fixLink}
                  style={{ color: "var(--brand, #004B23)" }}
                >
                  → ga er heen
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
        Concurrenten in 500m straal
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
                <th style={cellStyle(true)}>Naam</th>
                <th style={cellStyle(true)}>Afstand</th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>GBP</th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>
                  Reviews
                </th>
                <th style={{ ...cellStyle(true), textAlign: "right" }}>
                  Totaal
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--brand-soft, #DCFCE7)" }}>
                <td style={cellStyle(false)}>—</td>
                <td style={{ ...cellStyle(false), fontWeight: 600 }}>
                  Jouw restaurant
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
        Trend (laatste {ordered.length} audits)
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
