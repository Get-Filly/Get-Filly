"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "../../_components/skeleton";
import { fetchMetaInsights, type MetaInsights } from "@/lib/api";

// ============================================================
// MetaLiveInsights — echt, live engagement-blok per platform
// ============================================================
// Toont de ECHTE cijfers van de gekoppelde Meta-koppeling voor één
// platform (Instagram óf Facebook): likes/reacties/(shares) per bericht,
// + voor IG de volgers/berichten-count. Werkt met de goedgekeurde scopes
// (pages_read_engagement + instagram_basic). Bereik/impressions komen in
// fase 2 (read_insights + instagram_manage_insights). Bedoeld om bovenaan
// de IG-/FB-marketingpagina te plaatsen, bóven de voorbeeld-mocksecties.

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

function PostsTable({ rows, cols }: { rows: Row[]; cols: string[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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

export function MetaLiveInsights({
  platform,
}: {
  platform: "instagram" | "facebook";
}) {
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
            "Kon de live-cijfers niet ophalen. Is Facebook en Instagram gekoppeld onder Account → Koppelingen?",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isIg = platform === "instagram";
  const label = isIg ? "Instagram" : "Facebook";

  const igRows: Row[] = (data?.instagram?.posts ?? [])
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

  const fbRows: Row[] = (data?.facebook?.posts ?? [])
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
    <Card elevated style={{ marginBottom: "var(--space-4)" }}>
      <CardBody>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Live cijfers · {label}
          </div>
          <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
            ✓ echte koppeling
          </span>
        </div>

        {loading ? (
          <Skeleton style={{ height: 160 }} />
        ) : error ? (
          <div style={{ fontSize: 14, color: "var(--text)" }}>{error}</div>
        ) : !data?.pageSelected ? (
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
        ) : (
          <>
            {isIg && (
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
                  value={
                    data.instagram?.followersCount != null
                      ? nl(data.instagram.followersCount)
                      : "—"
                  }
                />
                <Stat
                  label="Berichten"
                  value={
                    data.instagram?.mediaCount != null
                      ? nl(data.instagram.mediaCount)
                      : "—"
                  }
                />
              </div>
            )}

            {isIg ? (
              igRows.length > 0 ? (
                <PostsTable rows={igRows} cols={["Likes", "Reacties"]} />
              ) : (
                <div style={{ fontSize: 14, color: "var(--tl)" }}>
                  Nog geen Instagram-berichten gevonden.
                </div>
              )
            ) : fbRows.length > 0 ? (
              <PostsTable rows={fbRows} cols={["Likes", "Reacties", "Shares"]} />
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl)" }}>
                Nog geen Facebook-berichten gevonden.
              </div>
            )}

            {data.notes.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tl)",
                  lineHeight: 1.6,
                  marginTop: 12,
                }}
              >
                {data.notes.map((n, i) => (
                  <div key={i}>· {n}</div>
                ))}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
