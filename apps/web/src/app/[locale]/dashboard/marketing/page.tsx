"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackToReportsLink } from "../_components/back-to-reports-link";
import {
  fetchMarketingMailStats,
  type MailStats,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * ============================================================
 * Marketing-hub, overkoepelende statistieken per kanaal
 * ============================================================
 *
 * Vier kanaal-cards (en later WhatsApp). Mail is direct beschikbaar
 * omdat we al `campaign_sends`-data hebben sinds 2026-05-04. IG/FB/
 * TikTok zijn Coming Soon, wachten op Meta + TikTok approval.
 *
 * Filly's wekelijkse rapport bovenaan: vanaf 1 actief kanaal.
 * Voor MVP: tekst-placeholder met Mail-aggregaat, Claude-call voor
 * echte cross-channel-analyse komt in fase 6.
 * ============================================================
 */

type ChannelStatus = "live" | "coming-soon" | "future";

type Channel = {
  key: string;
  name: string;
  href?: string;
  description: string;
  status: ChannelStatus;
};

export default function MarketingHubPage() {
  const t = useTranslations("dash_marketing_page");
  const { active } = useRestaurant();
  const [mailStats, setMailStats] = useState<MailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMarketingMailStats(30)
      .then((data) => {
        if (!cancelled) setMailStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("errors.unknown"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id, t]);

  // Channels-array. Mail krijgt mini-stats als we ze hebben opgehaald.
  const channels: Channel[] = [
    {
      key: "mail",
      name: t("channels.mail.name"),
      href: "/dashboard/marketing/mail",
      description: t("channels.mail.description"),
      status: "live",
      // Geen miniStats hier, eigenaar ziet de echte cijfers op de
      // detail-pagina. Cards op de hub blijven schoon en uniform met
      // de Coming-Soon-cards die ook geen cijfers tonen.
    },
    {
      key: "instagram",
      name: t("channels.instagram.name"),
      href: "/dashboard/marketing/instagram",
      description: t("channels.instagram.description"),
      status: "coming-soon",
    },
    {
      key: "facebook",
      name: t("channels.facebook.name"),
      href: "/dashboard/marketing/facebook",
      description: t("channels.facebook.description"),
      status: "coming-soon",
    },
    {
      key: "tiktok",
      name: t("channels.tiktok.name"),
      href: "/dashboard/marketing/tiktok",
      description: t("channels.tiktok.description"),
      status: "coming-soon",
    },
    {
      key: "whatsapp",
      name: t("channels.whatsapp.name"),
      description: t("channels.whatsapp.description"),
      status: "future",
    },
  ];

  const liveCount = channels.filter((c) => c.status === "live").length;
  const totalChannels = channels.filter((c) => c.status !== "future").length;

  return (
    <div className="page-full">
      <BackToReportsLink />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* Status-banner, bovenaan om direct context te geven. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-5)",
          backgroundColor:
            liveCount > 0
              ? "#F0F7F2"
              : "var(--color-brand-soft, #F3F4F6)",
          border: `1px solid ${
            liveCount > 0
              ? "#1F4A2D40"
              : "var(--color-border, #E4E4E7)"
          }`,
          borderRadius: "var(--radius-md)",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
          {liveCount > 0 ? "✓" : "🔵"}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              marginBottom: 4,
              color: liveCount > 0 ? "#1F4A2D" : "var(--text, #18181B)",
            }}
          >
            {t("banner.activeCount", { live: liveCount, total: totalChannels })}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
            }}
          >
            {liveCount > 0
              ? t("banner.someActive")
              : t("banner.noneActive")}
          </div>
        </div>
      </div>

      {/* Filly's wekelijks rapport, voor MVP eenvoudig: een tekst-blok
          met de belangrijkste mail-takeaway. Echte Claude-call met
          cross-channel-analyse komt in fase 6. */}
      {liveCount > 0 && mailStats && (
        <div
          style={{
            padding: "var(--space-4) var(--space-5)",
            marginBottom: "var(--space-5)",
            backgroundColor: "#FAF7F1",
            border: "1px solid #E5DFD0",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              fontSize: 13,
              fontWeight: 600,
              color: "#1F4A2D",
              marginBottom: "var(--space-2)",
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {t("report.heading")}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text, #18181B)",
              lineHeight: 1.7,
            }}
          >
            {buildFillyMailSummary(mailStats, t)}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 13,
            color: "#B00020",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}
        >
          {error}
        </div>
      )}

      {/* Kanaal-cards in grid. Auto-fill voor responsive zonder breakpoints. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {channels.map((c) => (
          <ChannelCard key={c.key} channel={c} />
        ))}
      </div>
    </div>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  const t = useTranslations("dash_marketing_page");
  // Klikbaar als de pagina bestaat, ook voor Coming Soon, want die
  // pagina's tonen óf een preview met voorbeeld-data (Instagram) óf
  // een nette uitleg "wat krijg je straks". Future-status (WhatsApp)
  // heeft géén pagina dus blijft niet-klikbaar.
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
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "var(--space-3)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: "var(--text, #18181B)",
            }}
          >
            {channel.name}
          </div>
          {channel.status === "live" && (
            <Badge variant="success" withDot>
              {t("status.live")}
            </Badge>
          )}
          {channel.status === "coming-soon" && (
            <Badge variant="info">{t("status.comingSoon")}</Badge>
          )}
          {channel.status === "future" && (
            <Badge variant="neutral">{t("status.future")}</Badge>
          )}
        </div>

        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
            lineHeight: 1.5,
          }}
        >
          {channel.description}
        </div>
        {/* Geen mini-stats meer op de hub, alle cards uniform.
            Detail-pagina toont de echte cijfers. */}
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

// Filly's eenvoudige rapport-tekst voor MVP. Geen Claude-call,
// deterministische samenvatting met conditionele highlights. Echte
// AI-rapport komt in fase 6 (cron + Sonnet 4.6 met cross-channel-data).
function buildFillyMailSummary(
  stats: MailStats,
  t: ReturnType<typeof useTranslations<"dash_marketing_page">>,
): string {
  if (stats.sent === 0) {
    return t("summary.noCampaigns");
  }

  const openVsBenchmark =
    stats.openRate !== null
      ? (stats.openRate - stats.benchmark.openRate) * 100
      : null;
  const clickVsBenchmark =
    stats.clickRate !== null
      ? (stats.clickRate - stats.benchmark.clickRate) * 100
      : null;

  const parts: string[] = [];

  if (openVsBenchmark !== null) {
    if (openVsBenchmark >= 2) {
      parts.push(
        t("summary.openAbove", {
          rate: (stats.openRate! * 100).toFixed(1),
          diff: openVsBenchmark.toFixed(1),
        }),
      );
    } else if (openVsBenchmark <= -3) {
      parts.push(
        t("summary.openBelow", {
          rate: (stats.openRate! * 100).toFixed(1),
          diff: Math.abs(openVsBenchmark).toFixed(1),
        }),
      );
    } else {
      parts.push(
        t("summary.openAround", {
          rate: (stats.openRate! * 100).toFixed(1),
        }),
      );
    }
  }

  if (clickVsBenchmark !== null && stats.delivered > 10) {
    if (clickVsBenchmark >= 1) {
      parts.push(
        t("summary.clickAbove", {
          rate: (stats.clickRate! * 100).toFixed(1),
          diff: clickVsBenchmark.toFixed(1),
        }),
      );
    } else if (clickVsBenchmark <= -1) {
      parts.push(
        t("summary.clickLow", {
          rate: (stats.clickRate! * 100).toFixed(1),
        }),
      );
    }
  }

  if (stats.bounceRate !== null && stats.bounceRate > 0.03) {
    parts.push(
      t("summary.bounceHigh", {
        rate: (stats.bounceRate * 100).toFixed(1),
      }),
    );
  }

  if (parts.length === 0) {
    parts.push(
      t("summary.fallback", {
        sent: stats.sent,
        count: stats.campaignCount,
      }),
    );
  }

  return parts.join(" ");
}
