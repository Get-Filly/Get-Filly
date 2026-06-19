"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import {
  fetchKpis,
  fetchMarketingMailStats,
  fetchReviews,
  type Kpis,
  type MailStats,
  type Review,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadCsv, exportPagePdf } from "@/lib/csv-export";

// ============================================================
// /dashboard/rapportages — hub-pagina
// ============================================================
// Sinds 2026-05-12 een hub i.p.v. één enorme detail-pagina (Floris-
// keuze: marketing-hub uit sidebar, kanaal-blokken hierheen
// verhuisd). Eigenaar kiest welk kanaal te bekijken; klik = detail-
// pagina met de volledige rapportage.
//
// Per kanaal-blok 0-3 mini-stats: de belangrijkste KPI's zodat de
// hub al iets vertelt zonder dat je hoeft te klikken. Mail haalt
// echte cijfers uit Resend; Bezetting uit KpiService. Sociale
// kanalen blijven kale Coming-Soon-cards tot OAuth-koppelingen live
// staan.
//
// Detail-pagina's:
//   - Bezetting → /dashboard/rapportages/bezetting (eigen route)
//   - Mail/IG/FB/TikTok → /dashboard/marketing/<kanaal> (legacy
//     routes, blijven bestaan)
//   - WhatsApp → geen detail-pagina (Later-status)

type ChannelStatus = "live" | "coming-soon" | "future";
type MiniStat = { label: string; value: string };

type ReportChannel = {
  key: string;
  name: string;
  status: ChannelStatus;
  href?: string;
  // Korte placeholder voor coming-soon / future-kanalen die nog geen
  // stats hebben. Wordt vervangen door echte cijfers zodra de
  // koppeling live is.
  placeholder?: string;
  // Loading-state per kanaal: cijfers worden async opgehaald, anders
  // ziet de eerste render eruit alsof er niks aan data is.
  miniStatsLoading?: boolean;
  miniStats?: MiniStat[];
};

// ============================================================
// exportChannelsToCsv, download het kanaal-overzicht als CSV
// ============================================================
// Eén rij per mini-stat (kanaal + status + statistiek + waarde);
// kanalen zonder stats krijgen één rij met alleen kanaal + status.
function exportChannelsToCsv(
  channels: ReportChannel[],
  labels: {
    headers: { channel: string; status: string; stat: string; value: string };
    statusLabel: Record<ChannelStatus, string>;
  },
) {
  const headers = [
    labels.headers.channel,
    labels.headers.status,
    labels.headers.stat,
    labels.headers.value,
  ];
  const rows = channels.flatMap((c) =>
    c.miniStats && c.miniStats.length > 0
      ? c.miniStats.map((s) => [
          c.name,
          labels.statusLabel[c.status],
          s.label,
          s.value,
        ])
      : [[c.name, labels.statusLabel[c.status], "", ""]],
  );
  downloadCsv("rapportages", headers, rows);
}

export default function RapportagesHubPage() {
  const t = useTranslations("dash_rapportages_page");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [mailStats, setMailStats] = useState<MailStats | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loadingMail, setLoadingMail] = useState(true);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchKpis()
      .then((data) => {
        if (!cancelled) {
          setKpis(data);
          setLoadingKpis(false);
        }
      })
      .catch(() => !cancelled && setLoadingKpis(false));
    fetchMarketingMailStats(30)
      .then((data) => {
        if (!cancelled) {
          setMailStats(data);
          setLoadingMail(false);
        }
      })
      .catch(() => !cancelled && setLoadingMail(false));
    fetchReviews()
      .then((data) => {
        if (!cancelled) {
          setReviews(data);
          setLoadingReviews(false);
        }
      })
      .catch(() => !cancelled && setLoadingReviews(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Review-stats afgeleid voor de Reviews-tegel: gemiddelde rating,
  // totaal, en hoeveel reviews nog actie vragen (≤3★ zonder reactie —
  // zelfde drempel die de reviews-pagina als 'Reactie nodig' toont).
  const reviewStats = reviews
    ? {
        avg: reviews.length
          ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
          : 0,
        total: reviews.length,
        needsResponse: reviews.filter(
          (r) => r.rating <= 3 && !r.response_text,
        ).length,
      }
    : null;

  const channels: ReportChannel[] = [
    {
      key: "occupancy",
      name: t("channels.occupancy"),
      href: "/dashboard/rapportages/bezetting",
      status: "live",
      miniStatsLoading: loadingKpis,
      miniStats: kpis
        ? [
            {
              label: t("stats.today"),
              value:
                kpis.today_pct !== null ? `${kpis.today_pct}%` : "—",
            },
            {
              label: t("stats.monthAvg"),
              value:
                kpis.month_avg_pct !== null
                  ? `${kpis.month_avg_pct}%`
                  : "—",
            },
            {
              label: t("stats.guestsToday"),
              value: kpis.today_guests.toLocaleString("nl-NL"),
            },
            {
              label: t("stats.viaFillyMonth"),
              value: kpis.month_filly_guests.toLocaleString("nl-NL"),
            },
          ]
        : undefined,
    },
    {
      key: "mail",
      name: t("channels.mail"),
      href: "/dashboard/marketing/mail",
      status: "live",
      miniStatsLoading: loadingMail,
      miniStats: mailStats
        ? [
            { label: t("stats.campaigns30d"), value: `${mailStats.campaignCount}` },
            {
              label: t("stats.sent"),
              value: mailStats.sent.toLocaleString("nl-NL"),
            },
            {
              label: t("stats.openRate"),
              value:
                mailStats.openRate !== null
                  ? `${Math.round(mailStats.openRate * 100)}%`
                  : "—",
            },
            {
              label: t("stats.clickRate"),
              value:
                mailStats.clickRate !== null
                  ? `${Math.round(mailStats.clickRate * 100)}%`
                  : "—",
            },
          ]
        : undefined,
    },
    {
      key: "reviews",
      name: t("channels.reviews"),
      href: "/dashboard/google-business/reviews",
      status: "live",
      miniStatsLoading: loadingReviews,
      miniStats: reviewStats
        ? [
            {
              label: t("stats.average"),
              value: reviewStats.total
                ? `${reviewStats.avg.toFixed(1)} ★`
                : "—",
            },
            {
              label: t("stats.totalReviews"),
              value: `${reviewStats.total}`,
            },
            {
              label: t("stats.responseNeeded"),
              value: `${reviewStats.needsResponse}`,
            },
          ]
        : undefined,
    },
    {
      key: "instagram",
      name: t("channels.instagram"),
      href: "/dashboard/marketing/instagram",
      status: "live",
      placeholder: t("placeholders.instagram"),
    },
    {
      key: "facebook",
      name: t("channels.facebook"),
      href: "/dashboard/marketing/facebook",
      status: "live",
      placeholder: t("placeholders.facebook"),
    },
    {
      key: "tiktok",
      name: t("channels.tiktok"),
      href: "/dashboard/marketing/tiktok",
      status: "coming-soon",
      placeholder: t("placeholders.tiktok"),
    },
    {
      key: "whatsapp",
      name: t("channels.whatsapp"),
      status: "future",
      placeholder: t("placeholders.whatsapp"),
    },
  ];

  return (
    <div className="page-full">
      <PageHeader
        title={t("title")}
        actions={
          <>
            {/* PDF = browser-printdialoog ("Bewaar als PDF"); CSV
                exporteert het kanaal-overzicht met de kerncijfers. */}
            <Button variant="secondary" onClick={exportPagePdf}>
              {t("actions.pdf")}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                exportChannelsToCsv(channels, {
                  headers: {
                    channel: t("csv.channel"),
                    status: t("csv.status"),
                    stat: t("csv.stat"),
                    value: t("csv.value"),
                  },
                  statusLabel: {
                    live: t("statusLabel.live"),
                    "coming-soon": t("statusLabel.comingSoon"),
                    future: t("statusLabel.future"),
                  },
                })
              }
            >
              {t("actions.exportCsv")}
            </Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          // Grotere tegels (min 340px), max 3 per rij op brede
          // viewports zodat de mini-stats ademruimte hebben.
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {channels.map((channel) => (
          <ReportChannelCard key={channel.key} channel={channel} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ReportChannelCard, kanaal-tegel met mini-stats
// ============================================================
// Klikbaar voor live + coming-soon (link naar detail-pagina).
// Future-status (WhatsApp) is niet klikbaar.
function ReportChannelCard({ channel }: { channel: ReportChannel }) {
  const t = useTranslations("dash_rapportages_page");
  const isClickable =
    (channel.status === "live" || channel.status === "coming-soon") &&
    !!channel.href;
  const cardContent = (
    <Card
      elevated
      style={{
        height: "100%",
        opacity:
          channel.status === "live"
            ? 1
            : channel.status === "coming-soon"
              ? 0.85
              : 0.7,
        cursor: isClickable ? "pointer" : "default",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      className={isClickable ? "ui-card--hoverable" : undefined}
    >
      <CardBody style={{ padding: "var(--space-5)" }}>
        {/* Header: naam + status-badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: "var(--text, #18181B)",
            }}
          >
            {channel.name}
          </div>
          {channel.status === "live" && (
            <Badge variant="success" withDot>
              {t("badge.active")}
            </Badge>
          )}
          {channel.status === "coming-soon" && (
            <Badge variant="info">{t("badge.comingSoon")}</Badge>
          )}
          {channel.status === "future" && (
            <Badge variant="neutral">{t("badge.future")}</Badge>
          )}
        </div>

        {/* Loading-skeleton voor live kanalen waarvan stats nog komen. */}
        {channel.miniStatsLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "var(--space-3)",
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  height: 50,
                  background: "var(--bg-soft, #FAF7F1)",
                  borderRadius: 6,
                }}
              />
            ))}
          </div>
        )}

        {/* Mini-stats: 2-koloms grid voor leesbare prominente cijfers.
            Cijfer groot, label klein erboven. */}
        {!channel.miniStatsLoading && channel.miniStats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "var(--space-3) var(--space-4)",
            }}
          >
            {channel.miniStats.map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tl)",
                    marginBottom: 4,
                    lineHeight: 1.2,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--text, #18181B)",
                    lineHeight: 1.1,
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Placeholder voor coming-soon / future-kanalen die nog
            geen stats hebben. */}
        {!channel.miniStats && !channel.miniStatsLoading && channel.placeholder && (
          <div
            style={{
              fontSize: 13,
              color: "var(--tl)",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {channel.placeholder}
          </div>
        )}
      </CardBody>
    </Card>
  );

  if (isClickable && channel.href) {
    return (
      <Link
        href={channel.href}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {cardContent}
      </Link>
    );
  }
  return <div>{cardContent}</div>;
}
