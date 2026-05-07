"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchCampaignBundle,
  type CampaignBundle,
  type Campaign,
} from "../../../../../lib/api";
import { Skeleton } from "../../../_components/skeleton";
import { Button } from "../../../../../components/ui/button";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { Badge } from "../../../../../components/ui/badge";

// ============================================================
// CampaignBundlePage, multi-channel bundle-overzicht
// ============================================================
//
// Per 2026-05-07 fase 4: aparte pagina voor een campaign_groups-rij.
// Eigenaar landt hier vanuit /campagnes als 'ie op een bundle-rij
// klikt. Toont alle gekoppelde campagnes in cards, klik op een card
// → individuele campagne-edit. 'Kanaal toevoegen' komt in fase 4b.

const TYPE_ICON: Record<string, string> = {
  mail: "✉️",
  social: "📱",
  whatsapp: "💬",
};

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  ingepland: "Ingepland",
  actief: "Actief",
  afgerond: "Afgerond",
};

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "neutral"> = {
  concept: "neutral",
  ingepland: "info",
  actief: "warning",
  afgerond: "success",
};

function formatEuroFromCents(cents: number): string {
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

function campaignImpactEuro(c: Campaign): number {
  return c.result_stats?.extra_revenue_cents ?? 0;
}

export default function CampaignBundlePage() {
  const params = useParams();
  const id = params.id as string;
  const [bundle, setBundle] = useState<CampaignBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCampaignBundle(id)
      .then((b) => {
        if (cancelled) return;
        setBundle(b);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Bundel niet gevonden of niet meer beschikbaar.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page" style={{ padding: 32 }}>
        <Skeleton style={{ height: 32, width: 240, marginBottom: 16 }} />
        <Skeleton style={{ height: 80, marginBottom: 12 }} />
        <Skeleton style={{ height: 200 }} />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="page" style={{ padding: 32 }}>
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
        <EmptyState
          icon="—"
          title="Bundel niet beschikbaar"
          description={error ?? "Deze bundel bestaat niet meer."}
        />
      </div>
    );
  }

  const campaigns = bundle.campaigns;
  const totalRes = campaigns.reduce(
    (acc, c) => acc + (c.result_stats?.extra_reservations ?? 0),
    0,
  );
  const totalRevenueCents = campaigns.reduce(
    (acc, c) => acc + campaignImpactEuro(c),
    0,
  );

  return (
    <div className="page" style={{ padding: 32 }}>
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

      {/* Header met bundle-naam + status-pill */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 28 }}>📦</div>
        <div style={{ flex: 1 }}>
          <div className="page-title" style={{ marginBottom: 4 }}>
            {bundle.group.name}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "3px 8px",
                background: "var(--accent, #1F4A2D)",
                color: "var(--white, #FFFFFF)",
                borderRadius: 999,
              }}
            >
              Bundel · {campaigns.length} kanalen
            </span>
            {bundle.group.theme && (
              <span style={{ color: "var(--tl)", fontSize: 12 }}>
                {bundle.group.theme}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }} />

      {/* Aggregated impact-row, parallel met campagne-detail. */}
      <div className="stats-row">
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Totaal extra reserveringen</div>
          <div className="stat-card-val">
            {totalRes > 0 ? `+${totalRes}` : "—"}
          </div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Totaal extra omzet</div>
          <div className="stat-card-val">
            {totalRevenueCents > 0
              ? formatEuroFromCents(totalRevenueCents)
              : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Aantal kanalen</div>
          <div className="stat-card-val">{campaigns.length}</div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }} />

      {/* Lijst van campagnes in de bundel als klikbare cards. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div>
            <div className="card-t">Campagnes in deze bundel</div>
            <div className="card-st">
              Klik op een kanaal om de inhoud te bekijken of bewerken.
            </div>
          </div>
        </div>
        <div className="card-b">
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                campaigns.length === 1
                  ? "1fr"
                  : "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {campaigns.map((c) => {
              const stats = c.result_stats ?? {};
              const extraRes = stats.extra_reservations ?? 0;
              const revenueCents = campaignImpactEuro(c);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/campagnes/${c.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    padding: "14px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border, #E5DFD0)",
                    background: "var(--white, #FFFFFF)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>
                        {TYPE_ICON[c.type] ?? "📢"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--ts)",
                        }}
                      >
                        {c.type}
                      </span>
                    </div>
                    <Badge
                      variant={STATUS_VARIANT[c.status] ?? "neutral"}
                      withDot
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      lineHeight: 1.3,
                    }}
                  >
                    {c.name}
                  </div>
                  {c.meta && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--tl)",
                        lineHeight: 1.4,
                      }}
                    >
                      {c.meta}
                    </div>
                  )}
                  {(extraRes > 0 || revenueCents > 0) && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--accent, #1F4A2D)",
                        fontWeight: 600,
                        marginTop: 4,
                      }}
                    >
                      +{extraRes} reserveringen ·{" "}
                      {formatEuroFromCents(revenueCents)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Per 2026-05-07 fase 4b: 'Kanaal toevoegen' aan een
              bestaande bundel komt eraan. Voor nu: hint + disabled
              knop zodat eigenaar weet dat 't kan. */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border, #E5DFD0)",
            }}
          >
            <Button variant="secondary" disabled>
              + Kanaal toevoegen aan deze bundel
            </Button>
            <div
              style={{
                fontSize: 12,
                color: "var(--tl)",
                marginTop: 8,
              }}
            >
              Komt eraan, dan kun je hier een extra kanaal aan de
              bundel koppelen zonder een nieuwe bundel te starten.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
