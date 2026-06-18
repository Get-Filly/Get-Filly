"use client";

import Link from "next/link";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card, CardBody } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { MetaLiveInsights } from "../_components/meta-live-insights";

/**
 * ============================================================
 * Facebook-marketing-pagina (preview met voorbeeld-data)
 * ============================================================
 *
 * Volledig uitgewerkte UI zoals 't straks gaat zijn, gevuld met
 * realistische horeca-cijfers. Verschilt van de Instagram-pagina:
 *
 *   - Reactions-mix (👍❤️😂😮😢😡) i.p.v. likes
 *   - Page-likes als hoofd-KPI i.p.v. volgers
 *   - Events als content-type (FB-specifiek)
 *   - Iets ouder publiek dan IG (35-54 zwaartepunt)
 *
 * Bij approval-binnen + OAuth-foundation klaar vervangen we de
 * PREVIEW-constants door echte Meta Graph API-fetches en is het
 * scherm productie-klaar.
 * ============================================================
 */

const PREVIEW = {
  page: {
    name: "Trattoria Demo",
    handle: "/trattoriademo",
    pageLikes: 2843,
    pageLikesDelta7d: 12,
    pageFollowers: 3127,
  },
  kpis: {
    reach30d: 8920,
    reach30dDelta: 6,
    impressions30d: 18420,
    pageViews30d: 412,
    pageViewsDelta: -3,
    engagementRate: 0.029, // 2.9%
    engagementRateDelta: 0.002,
  },
  benchmark: {
    engagementRate: 0.034,
    source: "Horeca-mediaan FB (Hootsuite 2024)",
  },
  // 30 dagen reach-data, FB heeft minder weekend-piek dan IG, vlakker
  // pattern, kleine spikes op evenement-aankondigingen.
  reachTrend: [
    220, 245, 215, 265, 280, 305, 290,
    240, 230, 250, 275, 295, 360, 340, // week 2: event-aankondiging
    260, 245, 270, 285, 310, 325, 305,
    250, 275, 290, 305, 320, 340, 318,
    265, 285,
  ],
  topPosts: [
    {
      type: "event" as const,
      thumbnail: "🎉",
      caption: "Wijn-pairing-avond, beperkt aantal plekken",
      reach: 6128,
      engagementRate: 7.8,
      reactions: { like: 145, love: 87, wow: 23, haha: 4, sad: 0, angry: 0 },
      comments: 38,
      shares: 24,
      postedAt: "Wo 23 apr",
    },
    {
      type: "photo" as const,
      thumbnail: "🍝",
      caption: "Verse pasta, handgemaakt, dagelijks vers in onze open keuken",
      reach: 3216,
      engagementRate: 5.4,
      reactions: { like: 98, love: 54, wow: 12, haha: 2, sad: 0, angry: 0 },
      comments: 22,
      shares: 11,
      postedAt: "Vr 26 apr",
    },
    {
      type: "video" as const,
      thumbnail: "🎬",
      caption: "Behind the scenes, chef Marco bereidt het seizoenmenu",
      reach: 2842,
      engagementRate: 4.6,
      reactions: { like: 67, love: 41, wow: 18, haha: 1, sad: 0, angry: 0 },
      comments: 15,
      shares: 9,
      postedAt: "Ma 21 apr",
    },
    {
      type: "link" as const,
      thumbnail: "🔗",
      caption: "Onze nieuwe seizoenkaart staat live op de website",
      reach: 1924,
      engagementRate: 3.2,
      reactions: { like: 42, love: 18, wow: 3, haha: 0, sad: 0, angry: 0 },
      comments: 8,
      shares: 5,
      postedAt: "Do 17 apr",
    },
    {
      type: "photo" as const,
      thumbnail: "👨‍🍳",
      caption: "Team-foto: ons brigade in actie tijdens de drukke vrijdagavond",
      reach: 1428,
      engagementRate: 4.1,
      reactions: { like: 38, love: 22, wow: 4, haha: 1, sad: 0, angry: 0 },
      comments: 6,
      shares: 3,
      postedAt: "Za 19 apr",
    },
  ],
  // FB heeft iets andere piek-tijden dan IG: lunch + avond doordeweeks
  postingHeatmap: [
    // Ma  Di  Wo  Do  Vr  Za  Zo
    [25, 28, 30, 32, 35, 42, 48], // 09:00
    [55, 58, 60, 62, 68, 75, 70], // 12:00 ← lunch-piek
    [70, 72, 78, 82, 80, 65, 45], // 18:00
    [40, 42, 48, 50, 35, 25, 18], // 21:00
  ],
  contentMix: [
    { type: "Foto's", count: 9, avgEngagement: 4.2, totalReach: 14600 },
    { type: "Video's", count: 4, avgEngagement: 5.1, totalReach: 9400 },
    { type: "Events", count: 2, avgEngagement: 8.0, totalReach: 8200 },
    { type: "Links", count: 3, avgEngagement: 2.8, totalReach: 4800 },
  ],
  audience: {
    topCities: [
      { name: "Amsterdam", percentage: 52 },
      { name: "Utrecht", percentage: 11 },
      { name: "Haarlem", percentage: 9 },
      { name: "Den Haag", percentage: 7 },
      { name: "Amstelveen", percentage: 5 },
    ],
    ageGroups: [
      { range: "18-24", percentage: 4 },
      { range: "25-34", percentage: 22 },
      { range: "35-44", percentage: 34 }, // FB-zwaartepunt
      { range: "45-54", percentage: 28 },
      { range: "55+", percentage: 12 },
    ],
    gender: { female: 58, male: 40, other: 2 },
  },
  reactionsBreakdown: {
    like: 68,
    love: 22,
    wow: 6,
    haha: 2,
    sad: 1,
    angry: 1,
  },
  fillyActions: [
    {
      severity: "tip" as const,
      title: "Events presteren bovengemiddeld",
      description:
        "Je 2 events (Wijn-pairing en eerder Asperge-week) scoorden 8.0% engagement, boven je FB-gemiddelde van 4.5%. Deze content-vorm pakt je publiek aan.",
      hint: "Plan komende maand 1-2 events. Een 'live cooking-demo' of 'wijn-pairing met de chef' past goed bij je profiel.",
    },
    {
      severity: "tip" as const,
      title: "Lunch-piek beter benutten",
      description:
        "Tussen 12:00-13:00 is je publiek het meest actief op zaterdag, maar je post er nooit. Mensen plannen daar hun avond.",
      hint: "Probeer een zaterdagochtend-post om 11:30 of 12:00, maakt de avondreservering al hot voordat ze hun zoektocht beginnen.",
    },
    {
      severity: "warning" as const,
      title: "Engagement onder mediaan",
      description:
        "2.9% vs horeca-mediaan 3.4%, niet alarmerend, wel verbeterruimte. Vooral je linkshares zijn zwak (2.8%).",
      hint: "Vervang link-only-posts door foto's met de link in de comment. FB-algoritme straft externe links zwaar.",
    },
  ],
  fillyAnalysis: `Je page-likes zijn stabiel met een lichte groei (+12 deze week). FB-publiek voor jouw onderneming is ouder dan op IG (zwaartepunt 35-54), wat past bij hogere besteed-power maar minder engagement-rate. Twee dingen vallen op: events presteren consistent dubbel zo goed als foto's, daar zou ik op blijven inzetten. En je doet erg weinig op zaterdagochtend, terwijl je publiek daar piek-actief is.`,
};

export default function FacebookMarketingPage() {
  const totalReactions = Object.values(PREVIEW.reactionsBreakdown).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="page-full">
      <PageHeader
        title={`Facebook · ${PREVIEW.page.name}`}
        subtitle="Page-bereik, reactions en publiek-data, afgelopen 30 dagen."
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

      {/* Echte, live cijfers uit de Meta-koppeling — bovenaan, vóór de
          voorbeeld-mocksecties hieronder. */}
      <MetaLiveInsights platform="facebook" />

      {/* Preview-banner */}
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
          <strong>Voorvertoning met voorbeeld-data.</strong> Dit is hoe je Facebook-pagina eruit gaat zien zodra Meta App Review binnen is en je je FB-page hebt gekoppeld. De cijfers hieronder zijn fictief.
        </div>
      </div>

      {/* Filly's analyse */}
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

      {/* 4 KPI-tegels: bereik / page-likes / engagement / page-views */}
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
          label="Page-likes"
          value={PREVIEW.page.pageLikes.toLocaleString("nl-NL")}
          delta={`+${PREVIEW.page.pageLikesDelta7d}`}
          deltaPositive
          subtext={`${PREVIEW.page.pageFollowers.toLocaleString("nl-NL")} volgers`}
        />
        <KpiTileWithBenchmark
          label="Engagement rate"
          value={PREVIEW.kpis.engagementRate}
          benchmark={PREVIEW.benchmark.engagementRate}
        />
        <KpiTile
          label="Page-views"
          value={PREVIEW.kpis.pageViews30d.toLocaleString("nl-NL")}
          delta={`${PREVIEW.kpis.pageViewsDelta}%`}
          deltaPositive={false}
          subtext="vs vorige 30 dgn"
        />
      </div>

      {/* Reach-grafiek */}
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
              Page-bereik · 30 dagen
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #52525B)",
              }}
            >
              Tabs: Bereik · Impressies · Engagement · Page-likes
            </div>
          </div>
          <ReachTrendChart data={PREVIEW.reachTrend} />
        </CardBody>
      </Card>

      {/* Reactions-mix, FB-specifiek, IG heeft alleen likes */}
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
            Reactions-mix · afgelopen 30 dagen
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              marginBottom: "var(--space-4)",
              lineHeight: 1.5,
            }}
          >
            {totalReactions} reacties op je posts, verdeling laat zien hoe je publiek emotioneel reageert.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <ReactionTile emoji="👍" label="Like" count={PREVIEW.reactionsBreakdown.like} total={totalReactions} />
            <ReactionTile emoji="❤️" label="Love" count={PREVIEW.reactionsBreakdown.love} total={totalReactions} />
            <ReactionTile emoji="😮" label="Wow" count={PREVIEW.reactionsBreakdown.wow} total={totalReactions} />
            <ReactionTile emoji="😂" label="Haha" count={PREVIEW.reactionsBreakdown.haha} total={totalReactions} />
            <ReactionTile emoji="😢" label="Sad" count={PREVIEW.reactionsBreakdown.sad} total={totalReactions} />
            <ReactionTile emoji="😡" label="Angry" count={PREVIEW.reactionsBreakdown.angry} total={totalReactions} />
          </div>
        </CardBody>
      </Card>

      {/* Top 5 posts */}
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
            Events &gt; Video's &gt; Foto's &gt; Links voor jouw publiek.
            Sterk gevoel-element ('love'-reacties hoog), content met
            warmte/menselijkheid pakt het beste.
          </div>
        </CardBody>
      </Card>

      {/* Posttijd-heatmap */}
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
            FB-publiek heeft 2 piek-momenten: lunch en avond. Voorgesteld
            piek-uur: <strong style={{ color: "#1F4A2D" }}>donderdag 18:00</strong>.
          </div>
          <PostingHeatmap data={PREVIEW.postingHeatmap} />
        </CardBody>
      </Card>

      {/* Content-mix */}
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
                    {row.avgEngagement.toFixed(1)}%
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

      {/* Publiek-demografie */}
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
            Wie volgt je page
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
              <DemoRow label="Vrouw" percentage={PREVIEW.audience.gender.female} />
              <DemoRow label="Man" percentage={PREVIEW.audience.gender.male} />
              <DemoRow label="Anders / niet bekend" percentage={PREVIEW.audience.gender.other} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filly's actie-voorstellen */}
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

      {/* Terug-link */}
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

function ReactionTile({
  emoji,
  label,
  count,
  total,
}: {
  emoji: string;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div
      style={{
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border, #E4E4E7)",
        backgroundColor: "white",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }} aria-hidden>
        {emoji}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--text, #18181B)",
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary, #52525B)",
          marginTop: 4,
        }}
      >
        {label} · {pct.toFixed(0)}%
      </div>
    </div>
  );
}

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
          <linearGradient id="fb-reach-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F4A2D" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1F4A2D" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathArea} fill="url(#fb-reach-gradient)" />
        <path
          d={pathLine}
          fill="none"
          stroke="#1F4A2D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
  const totalReactions = Object.values(post.reactions).reduce(
    (a, b) => a + b,
    0,
  );
  const typeLabel: Record<typeof post.type, string> = {
    photo: "Foto",
    video: "Video",
    event: "Event",
    link: "Link",
  };
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
          <Badge variant="neutral">{typeLabel[post.type]}</Badge>
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
          <span>👍 {totalReactions}</span>
          <span>💬 {post.comments}</span>
          <span>↪ {post.shares}</span>
        </div>
      </div>
    </div>
  );
}

function PostingHeatmap({ data }: { data: number[][] }) {
  const days = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const hours = ["09:00", "12:00", "18:00", "21:00"];

  function intensityColor(v: number): string {
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
