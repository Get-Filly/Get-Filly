"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchKpis,
  fetchMarketingMailStats,
  type Kpis,
  type MailStats,
} from "../../../lib/api";
import { PageHeader } from "../../../components/ui/page-header";
import { Card, CardBody } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";

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

export default function RapportagesHubPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [mailStats, setMailStats] = useState<MailStats | null>(null);
  const [loadingMail, setLoadingMail] = useState(true);
  const [loadingKpis, setLoadingKpis] = useState(true);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const channels: ReportChannel[] = [
    {
      key: "occupancy",
      name: "Bezetting",
      href: "/dashboard/rapportages/bezetting",
      status: "live",
      miniStatsLoading: loadingKpis,
      miniStats: kpis
        ? [
            {
              label: "Vandaag",
              value:
                kpis.today_pct !== null ? `${kpis.today_pct}%` : "—",
            },
            {
              label: "Gem. deze maand",
              value:
                kpis.month_avg_pct !== null
                  ? `${kpis.month_avg_pct}%`
                  : "—",
            },
            {
              label: "Gasten vandaag",
              value: kpis.today_guests.toLocaleString("nl-NL"),
            },
            {
              label: "Via Filly (maand)",
              value: kpis.month_filly_guests.toLocaleString("nl-NL"),
            },
          ]
        : undefined,
    },
    {
      key: "mail",
      name: "Mail",
      href: "/dashboard/marketing/mail",
      status: "live",
      miniStatsLoading: loadingMail,
      miniStats: mailStats
        ? [
            { label: "Campagnes (30d)", value: `${mailStats.campaignCount}` },
            {
              label: "Verstuurd",
              value: mailStats.sent.toLocaleString("nl-NL"),
            },
            {
              label: "Open rate",
              value:
                mailStats.openRate !== null
                  ? `${Math.round(mailStats.openRate * 100)}%`
                  : "—",
            },
            {
              label: "Click rate",
              value:
                mailStats.clickRate !== null
                  ? `${Math.round(mailStats.clickRate * 100)}%`
                  : "—",
            },
          ]
        : undefined,
    },
    {
      key: "instagram",
      name: "Instagram",
      href: "/dashboard/marketing/instagram",
      status: "coming-soon",
      placeholder: "Stats verschijnen na OAuth-koppeling.",
    },
    {
      key: "facebook",
      name: "Facebook",
      href: "/dashboard/marketing/facebook",
      status: "coming-soon",
      placeholder: "Stats verschijnen na Meta Graph API-koppeling.",
    },
    {
      key: "tiktok",
      name: "TikTok",
      href: "/dashboard/marketing/tiktok",
      status: "coming-soon",
      placeholder: "Stats verschijnen na TikTok Marketing API-koppeling.",
    },
    {
      key: "whatsapp",
      name: "WhatsApp",
      status: "future",
      placeholder: "Komt in een latere fase.",
    },
  ];

  return (
    <div className="page-full">
      <PageHeader title="Rapportages" />

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
              Actief
            </Badge>
          )}
          {channel.status === "coming-soon" && (
            <Badge variant="info">Binnenkort</Badge>
          )}
          {channel.status === "future" && (
            <Badge variant="neutral">Later</Badge>
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
