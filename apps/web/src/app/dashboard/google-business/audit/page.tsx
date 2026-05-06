"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card, CardBody } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import {
  fetchGoogleProfileAudit,
  type AuditResult,
  type AuditSeverity,
  type AuditFinding,
} from "../../../../lib/api";
import { useRestaurant } from "../../../../lib/restaurant-context";

/**
 * ============================================================
 * Profiel-audit pagina (fase B)
 * ============================================================
 *
 * Toont de uitkomst van de backend-rules-engine. 12+ checks over
 * Google-profielinfo (foto's, telefoon, openingstijden, etc.) met
 * concrete actie-hints per finding.
 *
 * Drie visuele groepen, in deze volgorde:
 *   1. Critical, rode banner, max-impact issues (bv. profiel staat
 *      op "tijdelijk gesloten")
 *   2. Warning, oranje, kerninfo ontbreekt (telefoon, website,
 *      openingstijden, te weinig foto's of reviews)
 *   3. Tip, blauw, verbeterruimte (rating-coaching, weekend-uren etc)
 *
 * Bij geen koppeling: empty-state die naar /dashboard/google-business
 * verwijst voor de connect-flow.
 *
 * Geen Claude-call → geen kosten per page-load → mag elke keer
 * opnieuw vers berekend worden zonder cache-zorg.
 * ============================================================
 */

export default function ProfielAuditPage() {
  const { active } = useRestaurant();
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotConnected(false);
    fetchGoogleProfileAudit()
      .then((data) => {
        if (!cancelled) setAudit(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Onbekende fout";
        // Backend geeft NotFound met "Geen Google-koppeling", vangen
        // we apart op zodat de empty-state een nette CTA kan tonen i.p.v.
        // een rode error-banner.
        if (msg.includes("Geen Google-koppeling")) {
          setNotConnected(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  if (loading) {
    return (
      <div className="page-full">
        <PageHeader
          title="Profiel-audit"
          subtitle="Filly checkt wat er ontbreekt op je Google Business Profile."
        />
        <div
          style={{
            padding: "var(--space-4)",
            backgroundColor: "var(--color-surface-muted, #F4F4F5)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary, #52525B)",
            fontSize: 13,
          }}
        >
          Audit laden…
        </div>
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="page-full">
        <PageHeader
          title="Profiel-audit"
          subtitle="Filly checkt wat er ontbreekt op je Google Business Profile."
        />
        <EmptyState
          icon="🔵"
          title="Eerst Google koppelen"
          description="Koppel je Google Business Profile via de hub. Daarna kan Filly je profiel doorlopen op telefoon, openingstijden, foto's, reviews en meer."
          action={
            <Link href="/dashboard/google-business">
              <Button variant="primary">Naar de hub</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="page-full">
        <PageHeader
          title="Profiel-audit"
          subtitle="Filly checkt wat er ontbreekt op je Google Business Profile."
        />
        <div
          style={{
            fontSize: 13,
            color: "#B00020",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
          }}
        >
          {error ?? "Audit niet beschikbaar."}
        </div>
      </div>
    );
  }

  const allClear =
    audit.summary.critical === 0 &&
    audit.summary.warning === 0 &&
    audit.summary.tip === 0;

  return (
    <div className="page-full">
      <PageHeader
        title="Profiel-audit"
        subtitle="Filly checkt wat er ontbreekt op je Google Business Profile."
      />

      {/* Top-summary: 3 grote getallen per severity. Bij allemaal 0
          tonen we een groene "alles op orde"-strook. */}
      {allClear ? (
        <div
          style={{
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
            backgroundColor: "#F0F7F2",
            border: "1px solid #1F4A2D40",
            borderRadius: "var(--radius-md)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden>
            ✓
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: "#1F4A2D",
              marginBottom: 4,
            }}
          >
            Je profiel ziet er top uit
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
            }}
          >
            Filly heeft geen verbeterpunten gevonden. Goed bezig!
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-5)",
          }}
        >
          <SummaryTile
            count={audit.summary.critical}
            label="Kritiek"
            color="#B00020"
            bg="#FEF2F2"
          />
          <SummaryTile
            count={audit.summary.warning}
            label="Aandachtspunten"
            color="#92400E"
            bg="#FEF3C7"
          />
          <SummaryTile
            count={audit.summary.tip}
            label="Tips"
            color="#1E40AF"
            bg="#DBEAFE"
          />
        </div>
      )}

      {/* Lijst met findings. Backend stuurt al gesorteerd op severity. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {audit.findings.map((f) => (
          <FindingCard key={f.code} finding={f} />
        ))}
      </div>

      <div
        style={{
          marginTop: "var(--space-6)",
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          textAlign: "center",
        }}
      >
        Audit uitgevoerd om{" "}
        {new Date(audit.generatedAt).toLocaleString("nl-NL", {
          dateStyle: "short",
          timeStyle: "short",
        })}
        . Wijzigingen op je Google-profiel kunnen tot 24 uur duren voordat
        ze hier zichtbaar zijn (cache).
      </div>
    </div>
  );
}

function SummaryTile({
  count,
  label,
  color,
  bg,
}: {
  count: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        backgroundColor: bg,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1 }}>
        {count}
      </div>
      <div
        style={{
          fontSize: 13,
          color,
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  return (
    <Card elevated>
      <CardBody>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBottom: "var(--space-2)",
          }}
        >
          <SeverityIcon severity={finding.severity} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "center",
                marginBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: "var(--text, #18181B)",
                }}
              >
                {finding.title}
              </div>
              <SeverityBadge severity={finding.severity} />
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.5,
                marginBottom: "var(--space-2)",
              }}
            >
              {finding.description}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text, #18181B)",
                lineHeight: 1.5,
                paddingLeft: "var(--space-3)",
                borderLeft: "3px solid var(--color-brand, #1F4A2D)",
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              <strong>Wat doe je:</strong> {finding.actionHint}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function SeverityIcon({ severity }: { severity: AuditSeverity }) {
  const map: Record<AuditSeverity, { emoji: string; color: string }> = {
    critical: { emoji: "🛑", color: "#B00020" },
    warning: { emoji: "⚠️", color: "#92400E" },
    tip: { emoji: "💡", color: "#1E40AF" },
  };
  const { emoji, color } = map[severity];
  return (
    <div style={{ fontSize: 22, lineHeight: 1, color }} aria-hidden>
      {emoji}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const map: Record<AuditSeverity, { label: string; variant: "danger" | "warning" | "info" }> = {
    critical: { label: "Kritiek", variant: "danger" },
    warning: { label: "Aandachtspunt", variant: "warning" },
    tip: { label: "Tip", variant: "info" },
  };
  const { label, variant } = map[severity];
  return <Badge variant={variant}>{label}</Badge>;
}
