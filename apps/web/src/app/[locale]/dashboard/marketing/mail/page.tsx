"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  fetchMarketingMailStats,
  fetchMarketingMailCampaigns,
  type MailStats,
  type CampaignMailStats,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * ============================================================
 * Marketing → Mail-detail-pagina (fase 1, 2026-05-06)
 * ============================================================
 *
 * Volledig live met `campaign_sends`-data uit Resend webhooks.
 * Geen approval nodig, dit werkt vandaag al.
 *
 * Layout:
 *   - 5 KPI-tegels (verzonden / open / click / bounce / unsubscribe)
 *     met industrie-mediaan-vergelijking
 *   - Per-campagne tabel (laatste 90 dagen)
 *   - Empty-state als nog geen mail verzonden
 *
 * Heatmap (beste verzendmoment) en trends-grafiek volgen later,
 * pas relevant als klant >10 campagnes heeft verzonden.
 * ============================================================
 */

export default function MailMarketingPage() {
  const t = useTranslations("dash_marketing_mail_page");
  const { active } = useRestaurant();
  const [stats, setStats] = useState<MailStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignMailStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchMarketingMailStats(30),
      fetchMarketingMailCampaigns(90),
    ])
      .then(([s, c]) => {
        if (cancelled) return;
        setStats(s);
        setCampaigns(c);
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
  }, [active?.id]);

  if (loading) {
    return (
      <div className="page-full">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <div
          style={{
            padding: "var(--space-4)",
            backgroundColor: "var(--color-surface-muted, #F4F4F5)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary, #52525B)",
            fontSize: 13,
          }}
        >
          {t("loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} />
        <div
          style={{
            fontSize: 13,
            color: "#B00020",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!stats || stats.sent === 0) {
    return (
      <div className="page-full">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <EmptyState
          icon="📧"
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Link href="/dashboard/campagnes">
              <Button variant="primary">{t("empty.cta")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-full">
      <PageHeader
        title={t("title")}
        subtitle={t("summary", {
          sent: stats.sent.toLocaleString("nl-NL"),
          count: stats.campaignCount,
          days: stats.periodDays,
        })}
      />

      {/* KPI-tegels, 4 hoofd-metrics naast elkaar. Open + click hebben
          benchmark-vergelijking; bounce + unsubscribe alleen waarschuwing
          als boven drempel. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-5)",
        }}
      >
        <KpiTile
          label={t("kpi.sent")}
          value={stats.sent.toLocaleString("nl-NL")}
          subtext={t("kpi.delivered", {
            delivered: stats.delivered.toLocaleString("nl-NL"),
          })}
        />
        <KpiTileWithBenchmark
          label={t("kpi.openRate")}
          value={stats.openRate}
          benchmark={stats.benchmark.openRate}
          higherIsBetter
        />
        <KpiTileWithBenchmark
          label={t("kpi.clickRate")}
          value={stats.clickRate}
          benchmark={stats.benchmark.clickRate}
          higherIsBetter
        />
        <KpiTileWithBenchmark
          label={t("kpi.bounceRate")}
          value={stats.bounceRate}
          benchmark={stats.benchmark.bounceRate}
          higherIsBetter={false}
        />
        <KpiTile
          label={t("kpi.unsubscribes")}
          value={
            stats.unsubscribeRate !== null
              ? `${(stats.unsubscribeRate * 100).toFixed(2)}%`
              : "—"
          }
          subtext={t("kpi.unsubscribedPeople", {
            people: stats.unsubscribed.toLocaleString("nl-NL"),
          })}
        />
      </div>

      {/* Industrie-bron transparant tonen, credibility. */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary, #52525B)",
          marginBottom: "var(--space-5)",
          textAlign: "center",
        }}
      >
        {t("benchmarkSource", { source: stats.benchmark.source })}
      </div>

      {/* Per-campagne tabel, sorteer op datum aflopend (recent eerst) */}
      <Card noPadding>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              fontSize: 13,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--color-border, #E4E4E7)",
                  color: "var(--text-secondary, #52525B)",
                  fontWeight: 500,
                }}
              >
                <th style={{ padding: "10px 12px" }}>{t("table.campaign")}</th>
                <th style={{ padding: "10px 12px" }}>{t("table.status")}</th>
                <th style={{ padding: "10px 12px" }}>{t("table.sent")}</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.open")}
                </th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.click")}
                </th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.bounce")}
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "var(--space-6) var(--space-4)",
                      textAlign: "center",
                      color: "var(--text-secondary, #52525B)",
                      fontStyle: "italic",
                    }}
                  >
                    {t("table.emptyPeriod")}
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr
                    key={c.campaignId}
                    style={{
                      borderBottom:
                        "1px solid var(--color-border, #E4E4E7)",
                    }}
                  >
                    <td style={{ padding: "12px" }}>
                      <Link
                        href={`/dashboard/campagnes/${c.campaignId}`}
                        style={{
                          fontWeight: 500,
                          color: "var(--text, #18181B)",
                          textDecoration: "none",
                        }}
                      >
                        {c.campaignName}
                      </Link>
                      {c.executedAt && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary, #52525B)",
                            marginTop: 2,
                          }}
                        >
                          {t("table.sentOn", {
                            date: new Date(c.executedAt).toLocaleDateString(
                              "nl-NL",
                              { day: "numeric", month: "short" },
                            ),
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      {c.sent.toLocaleString("nl-NL")}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {c.openRate !== null
                        ? `${(c.openRate * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {c.clickRate !== null
                        ? `${(c.clickRate * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {c.bounced > 0 ? c.bounced : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div
        style={{
          marginTop: "var(--space-4)",
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          textAlign: "center",
        }}
      >
        {t("footnote")}
      </div>
    </div>
  );
}

// ---------------- Sub-components ----------------

function KpiTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border, #E4E4E7)",
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary, #52525B)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text, #18181B)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {subtext && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            marginTop: 8,
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

function KpiTileWithBenchmark({
  label,
  value,
  benchmark,
  higherIsBetter,
}: {
  label: string;
  value: number | null;
  benchmark: number;
  higherIsBetter: boolean;
}) {
  const t = useTranslations("dash_marketing_mail_page");
  const valuePct =
    value !== null ? `${(value * 100).toFixed(1)}%` : "—";
  const benchmarkPct = `${(benchmark * 100).toFixed(1)}%`;

  const isBetter =
    value !== null &&
    (higherIsBetter ? value > benchmark : value < benchmark);
  const isWorse =
    value !== null &&
    (higherIsBetter ? value < benchmark : value > benchmark);

  return (
    <div
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border, #E4E4E7)",
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary, #52525B)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--text, #18181B)",
            lineHeight: 1,
          }}
        >
          {valuePct}
        </div>
        {isBetter && (
          <Badge variant="success" withDot>
            {t("benchmark.above")}
          </Badge>
        )}
        {isWorse && <Badge variant="warning">{t("benchmark.below")}</Badge>}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          marginTop: 8,
        }}
      >
        {t("benchmark.median", { value: benchmarkPct })}
      </div>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const t = useTranslations("dash_marketing_mail_page");
  const map: Record<string, { label: string; variant: "success" | "info" | "warning" | "neutral" }> = {
    afgerond: { label: t("status.afgerond"), variant: "success" },
    actief: { label: t("status.actief"), variant: "info" },
    ingepland: { label: t("status.ingepland"), variant: "info" },
    concept: { label: t("status.concept"), variant: "neutral" },
    gearchiveerd: { label: t("status.gearchiveerd"), variant: "neutral" },
  };
  const config = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
