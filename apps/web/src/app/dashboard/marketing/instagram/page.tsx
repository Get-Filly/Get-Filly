"use client";

import Link from "next/link";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card, CardBody } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";

/**
 * ============================================================
 * Instagram-marketing-pagina (preview met voorbeeld-data)
 * ============================================================
 *
 * Volledig uitgewerkte UI zoals 't straks gaat zijn — gevuld met
 * realistische mock-data zodat eigenaar (en wij) visueel kunnen zien
 * hoe de pagina werkt voordat de echte Meta-API-koppeling klaar is.
 *
 * Bovenaan een **preview-banner** zodat 100% duidelijk is dat de
 * cijfers fictief zijn. Zodra Meta App Review binnen is + OAuth-
 * foundation gebouwd, vervangen we de PREVIEW_DATA-constants door
 * echte API-fetches en is het scherm klaar voor productie.
 *
 * Geen externe charting-library: SVG-charts inline gehouden voor
 * minimale bundle-size en gemak van customisering. Bij meer charts
 * later kan recharts als dep erbij.
 * ============================================================
 */

// Realistische horeca-cijfers voor een Italiaans restaurant in
// Amsterdam met ~1.250 volgers. Gebaseerd op gemiddeldes uit
// Mosseri's IG creator-data 2024-2025.
const PREVIEW = {
  account: {
    handle: "@trattoria_demo",
    followers: 1247,
    followersDelta7d: 34,
    followingCount: 892,
  },
  kpis: {
    reach30d: 5412,
    reach30dDelta: 12, // % vs vorige periode
    impressions30d: 12846,
    profileViews30d: 234,
    profileViewsDelta: -8,
    engagementRate: 0.038, // 3.8%
    engagementRateDelta: -0.003, // -0.3 pp
  },
  benchmark: {
    engagementRate: 0.042, // horeca-mediaan
    source: "Horeca-mediaan IG (Hootsuite 2024)",
  },
  // 30 dagen reach-data voor de SVG-grafiek (weekend-piek-pattern).
  reachTrend: [
    180, 220, 195, 240, 310, 420, 380, // wk 1: za-zo piek
    160, 190, 175, 210, 285, 395, 360,
    200, 230, 215, 260, 320, 440, 405, // wk 3: hogere piek (Reel viral)
    175, 205, 190, 225, 295, 410, 372,
    185, 215,
  ],
  topPosts: [
    {
      type: "reel" as const,
      thumbnail: "🎬",
      caption: "Open keuken op donderdagavond — zo komen onze tagliatelle tot stand",
      reach: 4128,
      engagementRate: 8.4,
      likes: 287,
      comments: 34,
      shares: 23,
      saves: 67,
      postedAt: "Do 24 apr",
    },
    {
      type: "carousel" as const,
      thumbnail: "📸",
      caption: "Seizoenmenu mei: van bovenaf gefotografeerd, zes gerechten",
      reach: 2316,
      engagementRate: 12.0,
      likes: 198,
      comments: 41,
      shares: 18,
      saves: 102,
      postedAt: "Wo 30 apr",
    },
    {
      type: "photo" as const,
      thumbnail: "🍝",
      caption: "Burrata met truffel-pasta, dichtbij — close-up van het bord",
      reach: 1842,
      engagementRate: 6.1,
      likes: 89,
      comments: 12,
      shares: 8,
      saves: 24,
      postedAt: "Vr 18 apr",
    },
    {
      type: "reel" as const,
      thumbnail: "🍷",
      caption: "Wijnpairing-avond: 4 wijnen, 4 gangen — 12-seconden timelapse",
      reach: 1604,
      engagementRate: 5.8,
      likes: 76,
      comments: 9,
      shares: 11,
      saves: 33,
      postedAt: "Za 26 apr",
    },
    {
      type: "carousel" as const,
      thumbnail: "👨‍🍳",
      caption: "Team-foto's: ons keukenbrigade in actie",
      reach: 1125,
      engagementRate: 5.2,
      likes: 58,
      comments: 7,
      shares: 4,
      saves: 18,
      postedAt: "Ma 21 apr",
    },
  ],
  // 4 tijdsloten × 7 dagen. Waarde 0-100 = relatieve audience-activity.
  // Pattern: doordeweek avond actief, weekend ochtend lager.
  postingHeatmap: [
    // Ma  Di  Wo  Do  Vr  Za  Zo
    [20, 18, 22, 24, 28, 35, 42], // 09:00
    [45, 40, 42, 48, 52, 65, 58], // 12:00
    [82, 85, 88, 92, 75, 70, 35], // 18:00 ← piek doordeweeks
    [25, 22, 35, 30, 18, 15, 12], // 21:00
  ],
  contentMix: [
    { type: "Reels", count: 6, avgEngagement: 8.2, totalReach: 24500 },
    { type: "Carousels", count: 4, avgEngagement: 6.8, totalReach: 8200 },
    { type: "Foto's", count: 8, avgEngagement: 3.1, totalReach: 12300 },
    { type: "Stories", count: 21, avgEngagement: null, totalReach: 3400 },
  ],
  audience: {
    topCities: [
      { name: "Amsterdam", percentage: 58 },
      { name: "Utrecht", percentage: 12 },
      { name: "Haarlem", percentage: 8 },
      { name: "Den Haag", percentage: 6 },
      { name: "Rotterdam", percentage: 4 },
    ],
    ageGroups: [
      { range: "18-24", percentage: 10 },
      { range: "25-34", percentage: 42 },
      { range: "35-44", percentage: 28 },
      { range: "45-54", percentage: 18 },
      { range: "55+", percentage: 2 },
    ],
    gender: { female: 64, male: 34, other: 2 },
  },
  fillyActions: [
    {
      severity: "warning" as const,
      title: "Reels-momentum vasthouden",
      description:
        "Je laatste Reel was 4 dagen geleden. Het IG-algoritme straft inactiviteit binnen kanalen — verwacht 20-30% reach-daling als je deze week niets nieuws maakt.",
      hint: "Maak voor zaterdag een nieuwe Reel. Behind-the-scenes uit de keuken werkt voor jou consistent goed.",
    },
    {
      severity: "tip" as const,
      title: "Onderbenutte tijdslot",
      description:
        "Woensdag 18:00-19:30 — je publiek is dan piek-actief, maar je hebt deze maand 0 posts in dat slot.",
      hint: "Plan komende woensdag een Story of Reel om dit gat te vullen.",
    },
    {
      severity: "tip" as const,
      title: "Hashtag-experiment",
      description:
        "#amsterdamfoodie heeft je 3 keer 2× boven-gemiddeld bereik gegeven. Andere hashtags presteren minder — maar je gebruikt 'm maar bij 1 op de 5 posts.",
      hint: "Zet 'm consistent in op je top-5 hashtags.",
    },
  ],
  fillyAnalysis: `Je groei zit in een goede flow — +34 volgers deze week (+2.8%). Reels presteren consistent 4× beter dan foto's, dus daar zou ik op blijven zetten. Twee dingen vallen op: tussen 18:00-19:30 op woensdag is je publiek het meest online maar je post er nooit, en je laatste Reel was 4 dagen geleden — algoritme-momentum begint te slippen.`,
};

export default function InstagramMarketingPage() {
  return (
    <div className="page-full">
      <PageHeader
        title={`Instagram · ${PREVIEW.account.handle}`}
        subtitle="Bereik, engagement en publiek — afgelopen 30 dagen."
        actions={
          <>
            <Button variant="secondary" size="sm" disabled title="Beschikbaar na Meta-koppeling">
              Vernieuw
            </Button>
            <Button variant="danger" size="sm" disabled title="Beschikbaar na Meta-koppeling">
              Ontkoppel
            </Button>
          </>
        }
      />

      {/* Preview-banner — duidelijk zichtbaar dat dit voorbeeld-data is */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          marginBottom: "var(--space-5)",
          backgroundColor: "#FEF3C7",
          border: "1px solid #FCD34D",
          borderRadius: "var(--radius-md)",
          fontSize: 13,
          color: "#92400E",
          lineHeight: 1.6,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <span style={{ fontSize: 18 }} aria-hidden>👁️</span>
        <div>
          <strong>Voorvertoning met voorbeeld-data.</strong> Dit is hoe je Instagram-pagina eruit gaat zien zodra Meta App Review binnen is en je je IG-account hebt gekoppeld. De cijfers hieronder zijn fictief.
        </div>
      </div>

      {/* Filly's analyse — bovenaan zodat 't direct opvalt. Past bij
          Filly-eerst architectuur die we hebben afgesproken. */}
      <Card>
        <CardBody>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-brand, #1F4A2D)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: "var(--space-2)",
            }}
          >
            Filly's analyse · 30 dagen
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text, #18181B)",
              lineHeight: 1.7,
              marginBottom: "var(--space-3)",
            }}
          >
            "{PREVIEW.fillyAnalysis}"
          </div>
          <Button variant="primary" size="sm" disabled title="Beschikbaar na koppeling">
            Vraag Filly om content-voorstel
          </Button>
        </CardBody>
      </Card>

      {/* 4 KPI-tegels: bereik / volgers / engagement / profile views */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
          marginTop: "var(--space-5)",
          marginBottom: "var(--space-5)",
        }}
      >
        <KpiTile
          label="Bereik"
          value={PREVIEW.kpis.reach30d.toLocaleString("nl-NL")}
          delta={`+${PREVIEW.kpis.reach30dDelta}%`}
          deltaPositive
          subtext={`${PREVIEW.kpis.impressions30d.toLocaleString("nl-NL")} impressies`}
        />
        <KpiTile
          label="Volgers"
          value={PREVIEW.account.followers.toLocaleString("nl-NL")}
          delta={`+${PREVIEW.account.followersDelta7d}`}
          deltaPositive
          subtext="afgelopen 7 dagen"
        />
        <KpiTileWithBenchmark
          label="Engagement rate"
          value={PREVIEW.kpis.engagementRate}
          benchmark={PREVIEW.benchmark.engagementRate}
        />
        <KpiTile
          label="Profile views"
          value={PREVIEW.kpis.profileViews30d.toLocaleString("nl-NL")}
          delta={`${PREVIEW.kpis.profileViewsDelta}%`}
          deltaPositive={false}
          subtext="vs vorige 30 dgn"
        />
      </div>

      {/* Engagement-grafiek (30 dgn) — simpele SVG area-chart */}
      <Card>
        <CardBody>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-3)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text, #18181B)",
              }}
            >
              Bereik · 30 dagen
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              Tabs: Bereik · Impressies · Engagement · Volgers
            </div>
          </div>
          <ReachTrendChart data={PREVIEW.reachTrend} />
        </CardBody>
      </Card>

      {/* Top 5 posts deze maand */}
      <Card style={{ marginTop: "var(--space-5)" }}>
        <CardBody>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-3)",
            }}
          >
            Top 5 posts deze maand
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {PREVIEW.topPosts.map((post, i) => (
              <PostRow key={i} post={post} rank={i + 1} />
            ))}
          </div>
          <div
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3)",
              backgroundColor: "#FAF7F1",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#1F4A2D" }}>Filly's patroon:</strong>{" "}
            warm interieur + close-up gerechten = consistent hoog-presterende mix.
            Reels &gt; Carousels &gt; Foto's voor jouw publiek.
          </div>
        </CardBody>
      </Card>

      {/* Beste posttijd-heatmap */}
      <Card style={{ marginTop: "var(--space-5)" }}>
        <CardBody>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-2)",
            }}
          >
            Beste tijd om te posten
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              marginBottom: "var(--space-3)",
              lineHeight: 1.5,
            }}
          >
            Hoe donkerder, hoe meer je publiek dan online is. Voorgesteld
            piek-uur: <strong style={{ color: "#1F4A2D" }}>woensdag 18:00</strong>.
          </div>
          <PostingHeatmap data={PREVIEW.postingHeatmap} />
        </CardBody>
      </Card>

      {/* Content-mix vergelijking */}
      <Card style={{ marginTop: "var(--space-5)" }}>
        <CardBody>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-3)",
            }}
          >
            Content-mix · laatste 30 dagen
          </div>
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
                <th style={{ padding: "8px 0" }}>Type</th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>Posts</th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>
                  Gem. engagement
                </th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>
                  Totaal bereik
                </th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW.contentMix.map((row) => (
                <tr
                  key={row.type}
                  style={{
                    borderBottom: "1px solid var(--color-border, #E4E4E7)",
                  }}
                >
                  <td style={{ padding: "10px 0", fontWeight: 500 }}>
                    {row.type}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>
                    {row.count}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>
                    {row.avgEngagement !== null
                      ? `${row.avgEngagement.toFixed(1)}%`
                      : <span style={{ color: "var(--text-secondary, #52525B)" }}>n/a</span>}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>
                    {row.totalReach.toLocaleString("nl-NL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Publiek-demografie: 3 kolommen naast elkaar */}
      <Card style={{ marginTop: "var(--space-5)" }}>
        <CardBody>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text, #18181B)",
              marginBottom: "var(--space-3)",
            }}
          >
            Wie volgt je
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--space-5)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary, #52525B)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: "var(--space-2)",
                }}
              >
                Top 5 steden
              </div>
              {PREVIEW.audience.topCities.map((city) => (
                <DemoRow
                  key={city.name}
                  label={city.name}
                  percentage={city.percentage}
                />
              ))}
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary, #52525B)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: "var(--space-2)",
                }}
              >
                Leeftijd
              </div>
              {PREVIEW.audience.ageGroups.map((age) => (
                <DemoRow
                  key={age.range}
                  label={age.range}
                  percentage={age.percentage}
                />
              ))}
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary, #52525B)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: "var(--space-2)",
                }}
              >
                Geslacht
              </div>
              <DemoRow
                label="Vrouw"
                percentage={PREVIEW.audience.gender.female}
              />
              <DemoRow
                label="Man"
                percentage={PREVIEW.audience.gender.male}
              />
              <DemoRow
                label="Anders / niet bekend"
                percentage={PREVIEW.audience.gender.other}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filly's actie-voorstellen — bottom van de pagina, "wat doe ik nu?" */}
      <div style={{ marginTop: "var(--space-5)" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text, #18181B)",
            marginBottom: "var(--space-3)",
          }}
        >
          Filly's actie-voorstellen
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {PREVIEW.fillyActions.map((action, i) => (
            <ActionCard key={i} {...action} />
          ))}
        </div>
      </div>

      {/* Terug-navigatie onderaan */}
      <div
        style={{
          marginTop: "var(--space-6)",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        <Link
          href="/dashboard/marketing"
          style={{
            color: "var(--text-secondary, #52525B)",
            textDecoration: "none",
          }}
        >
          ← Terug naar Marketing-hub
        </Link>
      </div>
    </div>
  );
}

// ---------------- Sub-components ----------------

function KpiTile({
  label,
  value,
  delta,
  deltaPositive,
  subtext,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
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
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: deltaPositive ? "#16A34A" : "#B00020",
            }}
          >
            {delta}
          </div>
        )}
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
}: {
  label: string;
  value: number;
  benchmark: number;
}) {
  const valuePct = `${(value * 100).toFixed(1)}%`;
  const benchmarkPct = `${(benchmark * 100).toFixed(1)}%`;
  const isAbove = value >= benchmark;

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
        {!isAbove && <Badge variant="warning">Onder mediaan</Badge>}
        {isAbove && <Badge variant="success" withDot>Boven mediaan</Badge>}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          marginTop: 8,
        }}
      >
        Mediaan: {benchmarkPct}
      </div>
    </div>
  );
}

// SVG-area-chart voor reach-trend. Voor MVP zonder library — eenvoudige
// path-string vanuit data-array. 30 datapunten stretched over breedte.
function ReachTrendChart({ data }: { data: number[] }) {
  const width = 800;
  const height = 160;
  const padding = 16;
  const max = Math.max(...data);

  const points = data.map((v, i) => ({
    x: padding + (i * (width - 2 * padding)) / (data.length - 1),
    y: height - padding - ((v / max) * (height - 2 * padding)),
  }));

  const pathLine = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");
  const pathArea =
    `${pathLine} L${points[points.length - 1].x},${height - padding} L${points[0].x},${height - padding} Z`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <defs>
          <linearGradient id="reach-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F4A2D" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1F4A2D" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathArea} fill="url(#reach-gradient)" />
        <path
          d={pathLine}
          fill="none"
          stroke="#1F4A2D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Eindpunt-marker */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="4"
          fill="#1F4A2D"
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-secondary, #52525B)",
          marginTop: 4,
          paddingLeft: padding,
          paddingRight: padding,
        }}
      >
        <span>30 dgn geleden</span>
        <span>Vandaag</span>
      </div>
    </div>
  );
}

function PostRow({
  post,
  rank,
}: {
  post: typeof PREVIEW.topPosts[number];
  rank: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--color-border, #E4E4E7)",
        borderRadius: "var(--radius-md)",
        backgroundColor: "white",
      }}
    >
      <div
        style={{
          fontSize: 28,
          width: 48,
          height: 48,
          flexShrink: 0,
          backgroundColor: "var(--color-surface-muted, #F4F4F5)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden
      >
        {post.thumbnail}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-brand, #1F4A2D)",
            }}
          >
            #{rank}
          </span>
          <Badge variant="neutral">
            {post.type === "reel"
              ? "Reel"
              : post.type === "carousel"
                ? "Carousel"
                : "Foto"}
          </Badge>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary, #52525B)",
            }}
          >
            {post.postedAt}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--text, #18181B)",
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {post.caption}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            flexWrap: "wrap",
          }}
        >
          <span>👁️ {post.reach.toLocaleString("nl-NL")} bereik</span>
          <span style={{ fontWeight: 600, color: "#1F4A2D" }}>
            {post.engagementRate.toFixed(1)}% engagement
          </span>
          <span>♥ {post.likes}</span>
          <span>💬 {post.comments}</span>
          <span>↪ {post.shares}</span>
          <span>🔖 {post.saves}</span>
        </div>
      </div>
    </div>
  );
}

function PostingHeatmap({ data }: { data: number[][] }) {
  const days = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const hours = ["09:00", "12:00", "18:00", "21:00"];

  function intensityColor(v: number): string {
    // 0-100 → light brand-soft → solid brand-green
    if (v < 20) return "#F4F4F5";
    if (v < 40) return "#D1E5D8";
    if (v < 60) return "#9BC4A8";
    if (v < 80) return "#5A8E6A";
    return "#1F4A2D";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 4 }}>
        <thead>
          <tr>
            <th style={{ width: 56 }}></th>
            {days.map((d) => (
              <th
                key={d}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-secondary, #52525B)",
                  textAlign: "center",
                  padding: "0 4px",
                }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((h, hourIdx) => (
            <tr key={h}>
              <th
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-secondary, #52525B)",
                  textAlign: "right",
                  paddingRight: 8,
                }}
              >
                {h}
              </th>
              {data[hourIdx].map((v, dayIdx) => (
                <td
                  key={dayIdx}
                  title={`${days[dayIdx]} ${h}: ${v}% activiteit`}
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: intensityColor(v),
                    borderRadius: 4,
                    fontSize: 10,
                    color: v >= 60 ? "white" : "var(--text, #18181B)",
                    textAlign: "center",
                    verticalAlign: "middle",
                    fontWeight: 500,
                  }}
                >
                  {v >= 80 ? "★" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemoRow({
  label,
  percentage,
}: {
  label: string;
  percentage: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          flex: 1,
          fontSize: 13,
          color: "var(--text, #18181B)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 2,
          height: 6,
          backgroundColor: "var(--color-surface-muted, #F4F4F5)",
          borderRadius: 3,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: "#1F4A2D",
          }}
        />
      </div>
      <div
        style={{
          width: 36,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text, #18181B)",
          textAlign: "right",
        }}
      >
        {percentage}%
      </div>
    </div>
  );
}

function ActionCard({
  severity,
  title,
  description,
  hint,
}: {
  severity: "warning" | "tip";
  title: string;
  description: string;
  hint: string;
}) {
  const colors =
    severity === "warning"
      ? { icon: "⚠️", iconColor: "#92400E", border: "#FCD34D", bg: "#FEF3C7" }
      : { icon: "💡", iconColor: "#1E40AF", border: "#93C5FD", bg: "#DBEAFE" };

  return (
    <Card>
      <CardBody>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              fontSize: 22,
              lineHeight: 1,
              flexShrink: 0,
              padding: 6,
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: "var(--radius-md)",
            }}
            aria-hidden
          >
            {colors.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text, #18181B)",
                marginBottom: "var(--space-2)",
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.6,
                marginBottom: "var(--space-3)",
              }}
            >
              {description}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text, #18181B)",
                lineHeight: 1.5,
                paddingLeft: "var(--space-3)",
                borderLeft: `3px solid ${colors.iconColor}`,
                marginBottom: "var(--space-3)",
              }}
            >
              <strong>Voorstel:</strong> {hint}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <Button
                variant="primary"
                size="sm"
                disabled
                title="Beschikbaar na koppeling"
              >
                Filly schrijft 't
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled
                title="Beschikbaar na koppeling"
              >
                Negeren
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
