"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card, CardBody } from "../../../../components/ui/card";
import { Skeleton } from "../../_components/skeleton";
import { fetchMetaInsights, type MetaInsights } from "../../../../lib/api";

// ============================================================
// /dashboard/marketing/social — Social-prestaties (live, fase 1)
// ============================================================
// Toont de ECHTE engagement van de gekoppelde Facebook-pagina + Instagram-
// account (likes/reacties/shares per bericht, IG-volgers/berichten-count)
// via de goedgekeurde Meta-scopes (pages_read_engagement + instagram_basic).
// Bereik, impressions en profielweergaven komen pas met read_insights +
// instagram_manage_insights (fase 2, nieuwe Meta App Review).

function nl(n: number): string {
  return n.toLocaleString("nl-NL");
}
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function truncate(s: string | null, n = 80): string {
  if (!s) return "—";
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--tl)" }}>{label}</div>
    </div>
  );
}

type Row = {
  key: string;
  text: string;
  date: string;
  metrics: Array<{ label: string; value: number }>;
  href: string | null;
};

// Posts-tabel: bericht + datum + 2-3 engagement-kolommen. Rijen komen al
// gesorteerd op engagement binnen (bovenste = best presterend).
function PostsTable({ rows, cols }: { rows: Row[]; cols: string[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr
            style={{
              textAlign: "left",
              color: "var(--tl)",
              fontSize: 11,
              textTransform: "uppercase",
            }}
          >
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>Bericht</th>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>Datum</th>
            {cols.map((c) => (
              <th
                key={c}
                style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 8px", maxWidth: 360 }}>
                {r.href ? (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--text)", textDecoration: "none" }}
                  >
                    {r.text}
                  </a>
                ) : (
                  r.text
                )}
              </td>
              <td
                style={{
                  padding: "8px 8px",
                  color: "var(--tl)",
                  whiteSpace: "nowrap",
                }}
              >
                {r.date}
              </td>
              {r.metrics.map((m) => (
                <td
                  key={m.label}
                  style={{ padding: "8px 8px", textAlign: "right", fontWeight: 600 }}
                >
                  {nl(m.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SocialInsightsPage() {
  const [data, setData] = useState<MetaInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMetaInsights()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Kon de social-data niet ophalen. Is Facebook en Instagram gekoppeld onder Account → Koppelingen?",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ig = data?.instagram ?? null;
  const fb = data?.facebook?.posts ?? [];

  const igRows: Row[] = (ig?.posts ?? [])
    .slice()
    .sort((a, b) => b.likeCount + b.commentsCount - (a.likeCount + a.commentsCount))
    .slice(0, 10)
    .map((p) => ({
      key: p.id,
      text: truncate(p.caption),
      date: shortDate(p.timestamp),
      metrics: [
        { label: "Likes", value: p.likeCount },
        { label: "Reacties", value: p.commentsCount },
      ],
      href: p.permalink,
    }));

  const fbRows: Row[] = fb
    .slice()
    .sort(
      (a, b) =>
        b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares),
    )
    .slice(0, 10)
    .map((p) => ({
      key: p.id,
      text: truncate(p.message),
      date: shortDate(p.createdTime),
      metrics: [
        { label: "Likes", value: p.likes },
        { label: "Reacties", value: p.comments },
        { label: "Shares", value: p.shares },
      ],
      href: p.permalink,
    }));

  return (
    <div className="page-full">
      <Link
        href="/dashboard/rapportages"
        style={{
          fontSize: 13,
          color: "var(--ts)",
          textDecoration: "none",
          marginBottom: 14,
          display: "inline-block",
        }}
      >
        ← Terug naar Rapportages
      </Link>
      <PageHeader title="Social-prestaties" />

      <div
        style={{
          padding: "12px 16px",
          marginBottom: "var(--space-4)",
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "inset 4px 0 0 0 #1F4A2D",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text)",
        }}
      >
        <strong>Live cijfers uit je gekoppelde Facebook en Instagram.</strong>{" "}
        Likes, reacties en shares per bericht, plus je Instagram-volgers en het
        aantal berichten. Bereik, impressions en profielweergaven komen erbij
        zodra Meta de uitgebreide insights-toegang heeft goedgekeurd.
      </div>

      {loading ? (
        <>
          <Skeleton style={{ height: 120, marginBottom: 16 }} />
          <Skeleton style={{ height: 220 }} />
        </>
      ) : error ? (
        <Card elevated>
          <CardBody>
            <div style={{ fontSize: 14, color: "var(--text)" }}>{error}</div>
          </CardBody>
        </Card>
      ) : !data?.pageSelected ? (
        <Card elevated>
          <CardBody>
            <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
              Nog geen Facebook-pagina gekozen. Koppel Facebook en Instagram en
              kies je pagina via{" "}
              <Link
                href="/dashboard/account?tab=koppelingen"
                style={{ color: "var(--accent)", fontWeight: 600 }}
              >
                Account → Koppelingen
              </Link>
              .
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {ig && (
            <Card elevated style={{ marginBottom: "var(--space-4)" }}>
              <CardBody>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
                  📸 Instagram{ig.username ? ` · @${ig.username}` : ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 32,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}
                >
                  <Stat
                    label="Volgers"
                    value={ig.followersCount != null ? nl(ig.followersCount) : "—"}
                  />
                  <Stat
                    label="Berichten"
                    value={ig.mediaCount != null ? nl(ig.mediaCount) : "—"}
                  />
                </div>
                {igRows.length > 0 ? (
                  <PostsTable rows={igRows} cols={["Likes", "Reacties"]} />
                ) : (
                  <div style={{ fontSize: 14, color: "var(--tl)" }}>
                    Nog geen Instagram-berichten gevonden.
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card elevated style={{ marginBottom: "var(--space-4)" }}>
            <CardBody>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
                👍 Facebook{data.pageName ? ` · ${data.pageName}` : ""}
              </div>
              {fbRows.length > 0 ? (
                <PostsTable rows={fbRows} cols={["Likes", "Reacties", "Shares"]} />
              ) : (
                <div style={{ fontSize: 14, color: "var(--tl)" }}>
                  Nog geen Facebook-berichten gevonden.
                </div>
              )}
            </CardBody>
          </Card>

          {data.notes.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--tl)", lineHeight: 1.6 }}>
              {data.notes.map((n, i) => (
                <div key={i}>· {n}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
