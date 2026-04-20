"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchCampaign, type CampaignDetail } from "../../../../lib/api";
import { Skeleton } from "../../_components/skeleton";

function formatEuroFromCents(cents: number): string {
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const typeIcon: Record<string, string> = {
  mail: "✉️",
  social: "📱",
  whatsapp: "💬",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaign(id)
      .then((d) => {
        setCampaign(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="page-full">
        <Link
          href="/dashboard/campagnes"
          style={{
            fontSize: 13,
            color: "var(--ts)",
            textDecoration: "none",
            marginBottom: 16,
            display: "inline-block",
          }}
        >
          ← Terug naar campagnes
        </Link>
        <Skeleton height={28} width="40%" style={{ marginBottom: 12 }} />
        <Skeleton height={14} width="60%" style={{ marginBottom: 24 }} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="page-full">
        <Link
          href="/dashboard/campagnes"
          style={{ fontSize: 13, color: "var(--ts)" }}
        >
          ← Terug
        </Link>
        <div
          className="table-empty"
          style={{ color: "var(--red)", marginTop: 16 }}
        >
          {error ?? "Campagne niet gevonden"}
        </div>
      </div>
    );
  }

  const stats = (campaign.content?.stats ?? {}) as Record<string, number>;
  const resultStats = campaign.result_stats ?? {};
  const isMail = campaign.type === "mail";
  const isSocial = campaign.type === "social";

  return (
    <div className="page-full">
      <Link
        href="/dashboard/campagnes"
        style={{
          fontSize: 13,
          color: "var(--ts)",
          textDecoration: "none",
          marginBottom: 14,
          display: "inline-block",
        }}
      >
        ← Terug naar campagnes
      </Link>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 28 }}>{typeIcon[campaign.type]}</div>
        <div style={{ flex: 1 }}>
          <div className="page-title" style={{ marginBottom: 4 }}>
            {campaign.name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={`badge ${campaign.status}`}>
              {campaign.status}
            </span>
            <span style={{ color: "var(--tl)", fontSize: 12 }}>
              {campaign.meta ?? "—"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sg-btn">Dupliceren</button>
          <button className="sg-btn">Bewerken</button>
        </div>
      </div>

      <div style={{ marginBottom: 24 }} />

      {/* Impact summary */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Extra reserveringen</div>
          <div className="stat-card-val">
            +{resultStats.extra_reservations ?? 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Extra omzet (schatting)</div>
          <div className="stat-card-val">
            {formatEuroFromCents(
              resultStats.extra_revenue_cents ??
                (resultStats.extra_reservations ?? 0) * 4500,
            )}
          </div>
        </div>
        {isMail && (
          <>
            <div className="stat-card">
              <div className="stat-card-label">Verstuurd</div>
              <div className="stat-card-val">{stats.sent ?? "—"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Geopend</div>
              <div className="stat-card-val">
                {stats.opened ?? 0}
                {stats.sent ? (
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--tl)",
                      marginLeft: 6,
                      fontWeight: 400,
                    }}
                  >
                    ({Math.round(((stats.opened ?? 0) / stats.sent) * 100)}%)
                  </span>
                ) : null}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Geklikt</div>
              <div className="stat-card-val">
                {stats.clicked ?? 0}
                {stats.sent ? (
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--tl)",
                      marginLeft: 6,
                      fontWeight: 400,
                    }}
                  >
                    ({Math.round(((stats.clicked ?? 0) / stats.sent) * 100)}%)
                  </span>
                ) : null}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Afmeldingen</div>
              <div className="stat-card-val">{stats.unsubscribed ?? 0}</div>
            </div>
          </>
        )}
        {isSocial && (
          <>
            <div className="stat-card">
              <div className="stat-card-label">Impressies</div>
              <div className="stat-card-val">{stats.impressions ?? "—"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Likes</div>
              <div className="stat-card-val">{stats.likes ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Reacties</div>
              <div className="stat-card-val">{stats.comments ?? 0}</div>
            </div>
          </>
        )}
      </div>

      {/* Content preview */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div>
            <div className="card-t">Inhoud</div>
            <div className="card-st">
              {isMail
                ? "Mail-preview"
                : isSocial
                  ? "Social-post"
                  : "WhatsApp-bericht"}
            </div>
          </div>
        </div>
        <div className="card-b">
          {isMail && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                padding: 16,
                background: "var(--bg)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--tl)", marginBottom: 8 }}>
                <strong style={{ color: "var(--text)" }}>Van:</strong>{" "}
                {campaign.content?.from_name ?? "—"} · <strong style={{ color: "var(--text)" }}>reply:</strong>{" "}
                {campaign.content?.reply_to ?? "—"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {campaign.content?.subject_line ?? campaign.subject_line ?? "—"}
              </div>
              {campaign.content?.preheader && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    marginBottom: 12,
                  }}
                >
                  {campaign.content.preheader}
                </div>
              )}
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {campaign.content?.body_plain ??
                  campaign.body ??
                  "Geen inhoud"}
              </div>
            </div>
          )}
          {isSocial && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                padding: 16,
                background: "var(--bg)",
              }}
            >
              <div
                style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 10 }}
              >
                {campaign.content?.caption ??
                  campaign.body ??
                  "Geen caption"}
              </div>
              {campaign.content?.hashtags &&
                campaign.content.hashtags.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginBottom: 10,
                    }}
                  >
                    {campaign.content.hashtags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--tl)",
                }}
              >
                Platforms:{" "}
                {campaign.content?.platforms?.join(", ") ?? "—"}
              </div>
            </div>
          )}
          {!isMail && !isSocial && (
            <div style={{ fontSize: 13, color: "var(--ts)" }}>
              {campaign.content?.message_text ?? campaign.body ?? "—"}
            </div>
          )}
        </div>
      </div>

      {/* Tijdlijn + metadata */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div className="card">
          <div className="card-h">
            <div>
              <div className="card-t">Tijdlijn</div>
              <div className="card-st">Belangrijke momenten</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Aangemaakt</span>
                <span>{formatDate(campaign.created_at)}</span>
              </div>
              {campaign.scheduled_for && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--tl)" }}>Gepland voor</span>
                  <span>{formatDate(campaign.scheduled_for)}</span>
                </div>
              )}
              {campaign.executed_at && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--tl)" }}>Uitgevoerd op</span>
                  <span>{formatDate(campaign.executed_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <div className="card-t">Metadata</div>
              <div className="card-st">Tags &amp; eigenschappen</div>
            </div>
          </div>
          <div className="card-b">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Type</span>
                <span style={{ textTransform: "capitalize" }}>
                  {campaign.type}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--tl)" }}>Status</span>
                <span className={`badge ${campaign.status}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.tags && campaign.tags.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <span
                    style={{ color: "var(--tl)", display: "block", marginBottom: 4 }}
                  >
                    Tags
                  </span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {campaign.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
