"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackToReportsLink } from "../_components/back-to-reports-link";

/**
 * ============================================================
 * Marketing-hub, overkoepelende statistieken per kanaal
 * ============================================================
 *
Kanaal-cards. Instagram, Facebook en TikTok zijn Coming Soon (wachten op
 * Meta- en TikTok-goedkeuring). Mail is weg: Get-Filly mailt geen gasten
 * van klanten meer (2026-09-30).
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
  // Kanalen. Get-Filly mailt geen gasten meer, dus mail staat hier niet meer.
  const channels: Channel[] = [
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
