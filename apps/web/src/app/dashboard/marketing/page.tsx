"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../../components/ui/page-header";
import { Card, CardBody } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import {
  fetchMarketingMailStats,
  type MailStats,
} from "../../../lib/api";
import { useRestaurant } from "../../../lib/restaurant-context";

/**
 * ============================================================
 * Marketing-hub — overkoepelende statistieken per kanaal
 * ============================================================
 *
 * Vier kanaal-cards (en later WhatsApp). Mail is direct beschikbaar
 * omdat we al `campaign_sends`-data hebben sinds 2026-05-04. IG/FB/
 * TikTok zijn Coming Soon — wachten op Meta + TikTok approval.
 *
 * Filly's wekelijkse rapport bovenaan: vanaf 1 actief kanaal.
 * Voor MVP: tekst-placeholder met Mail-aggregaat — Claude-call voor
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
  // Mini-stats getoond op de card als 'ie live is. Berekend on-demand.
  miniStats?: {
    primary: { label: string; value: string };
    secondary?: { label: string; value: string };
  };
};

export default function MarketingHubPage() {
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
          setError(err instanceof Error ? err.message : "Onbekende fout");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Channels-array. Mail krijgt mini-stats als we ze hebben opgehaald.
  const channels: Channel[] = [
    {
      key: "mail",
      name: "Mail",
      href: "/dashboard/marketing/mail",
      description:
        "Open rates, click rates, beste verzendmoment en wat je beste campagnes deden — direct uit Resend.",
      status: "live",
      miniStats: mailStats
        ? {
            primary: {
              label: "Verzonden (30 dgn)",
              value: mailStats.sent.toLocaleString("nl-NL"),
            },
            secondary: {
              label: "Open rate",
              value:
                mailStats.openRate !== null
                  ? `${(mailStats.openRate * 100).toFixed(1)}%`
                  : "—",
            },
          }
        : undefined,
    },
    {
      key: "instagram",
      name: "Instagram",
      href: "/dashboard/marketing/instagram",
      description:
        "Bereik, engagement, top-posts en beste posttijd zodra je via OAuth koppelt.",
      status: "coming-soon",
    },
    {
      key: "facebook",
      name: "Facebook",
      href: "/dashboard/marketing/facebook",
      description:
        "Page-bereik, post-engagement en publiek-demografie via Meta Graph API.",
      status: "coming-soon",
    },
    {
      key: "tiktok",
      name: "TikTok",
      href: "/dashboard/marketing/tiktok",
      description:
        "Plays, watch-time, shares en for-you-ratio via TikTok Marketing API.",
      status: "coming-soon",
    },
    {
      key: "whatsapp",
      name: "WhatsApp",
      description:
        "Directe gast-communicatie met read-rates en reply-conversie. Komt in een latere fase.",
      status: "future",
    },
  ];

  const liveCount = channels.filter((c) => c.status === "live").length;
  const totalChannels = channels.filter((c) => c.status !== "future").length;

  return (
    <div className="page-full">
      <PageHeader
        title="Marketing"
        subtitle="Hoe presteren je kanalen? Filly meet, vergelijkt en stelt verbeteringen voor."
      />

      {/* Status-banner — bovenaan om direct context te geven. */}
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
            {liveCount} van {totalChannels} kanalen actief
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
            }}
          >
            {liveCount > 0
              ? "Mail-statistieken zijn live. Sociale kanalen volgen na de Meta + TikTok approval-aanvragen."
              : "Geen kanalen actief. Verstuur eerst een mail-campagne om je eerste statistieken te zien."}
          </div>
        </div>
      </div>

      {/* Filly's wekelijks rapport — voor MVP eenvoudig: een tekst-blok
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
            Filly's wekelijks rapport
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text, #18181B)",
              lineHeight: 1.7,
            }}
          >
            {buildFillyMailSummary(mailStats)}
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
          <ChannelCard key={c.key} channel={c} loading={loading} />
        ))}
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
  loading,
}: {
  channel: Channel;
  loading: boolean;
}) {
  // Klikbaar als de pagina bestaat — ook voor Coming Soon, want die
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

        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
            lineHeight: 1.5,
            marginBottom: channel.miniStats ? "var(--space-3)" : 0,
          }}
        >
          {channel.description}
        </div>

        {channel.status === "live" && (
          <div
            style={{
              borderTop: "1px solid var(--color-border, #E4E4E7)",
              paddingTop: "var(--space-3)",
              marginTop: "var(--space-3)",
              display: "flex",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            {loading ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  fontStyle: "italic",
                }}
              >
                Stats laden…
              </div>
            ) : channel.miniStats ? (
              <>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary, #52525B)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {channel.miniStats.primary.label}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "var(--text, #18181B)",
                    }}
                  >
                    {channel.miniStats.primary.value}
                  </div>
                </div>
                {channel.miniStats.secondary && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary, #52525B)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {channel.miniStats.secondary.label}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "var(--text, #18181B)",
                      }}
                    >
                      {channel.miniStats.secondary.value}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  fontStyle: "italic",
                }}
              >
                Nog geen verzonden mails — verstuur eerst een campagne.
              </div>
            )}
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

// Filly's eenvoudige rapport-tekst voor MVP. Geen Claude-call —
// deterministische samenvatting met conditionele highlights. Echte
// AI-rapport komt in fase 6 (cron + Sonnet 4.6 met cross-channel-data).
function buildFillyMailSummary(stats: MailStats): string {
  if (stats.sent === 0) {
    return "Je hebt deze maand nog geen mail-campagnes verzonden. Eerste campagne maak je via /campagnes.";
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
        `Je open rate van ${(stats.openRate! * 100).toFixed(1)}% zit ${openVsBenchmark.toFixed(1)}% boven de horeca-mediaan — sterk.`,
      );
    } else if (openVsBenchmark <= -3) {
      parts.push(
        `Je open rate van ${(stats.openRate! * 100).toFixed(1)}% zit ${Math.abs(openVsBenchmark).toFixed(1)}% onder de horeca-mediaan. Onderwerp-regels herzien?`,
      );
    } else {
      parts.push(
        `Je open rate van ${(stats.openRate! * 100).toFixed(1)}% ligt rond de horeca-mediaan.`,
      );
    }
  }

  if (clickVsBenchmark !== null && stats.delivered > 10) {
    if (clickVsBenchmark >= 1) {
      parts.push(
        `Click rate van ${(stats.clickRate! * 100).toFixed(1)}% is ${clickVsBenchmark.toFixed(1)}% boven mediaan.`,
      );
    } else if (clickVsBenchmark <= -1) {
      parts.push(
        `Click rate van ${(stats.clickRate! * 100).toFixed(1)}% is laag — duidelijke CTA toevoegen?`,
      );
    }
  }

  if (stats.bounceRate !== null && stats.bounceRate > 0.03) {
    parts.push(
      `Let op: bounce rate is ${(stats.bounceRate * 100).toFixed(1)}% — hoger dan ideaal (<2%). Lijst opschonen.`,
    );
  }

  if (parts.length === 0) {
    parts.push(
      `Je verstuurde ${stats.sent} mails over ${stats.campaignCount} campagne${stats.campaignCount === 1 ? "" : "s"}. Voor diepere analyse open de Mail-pagina.`,
    );
  }

  return parts.join(" ");
}
