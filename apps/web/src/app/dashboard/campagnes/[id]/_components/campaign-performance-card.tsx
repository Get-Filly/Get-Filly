"use client";

import { useEffect, useState } from "react";
import {
  fetchCampaignPerformance,
  markCampaignOutlier,
  unmarkCampaignOutlier,
  type CampaignPerformance,
  type CampaignClassification,
} from "../../../../../lib/api";
import { Card, CardBody } from "../../../../../components/ui/card";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";

// ============================================================
// CampaignPerformanceCard — score + metrics + outlier-knop
// ============================================================
//
// Toont op de campagne-detail-pagina de actuele performance:
//   - Score 0-100 + classification-badge (Winner/Average/Underperformer/
//     Geen data)
//   - Mail-breakdown: delivered / opened / clicked / open-rate / click-rate
//   - Conversie: reservations_attributed + guests_attributed
//   - Outlier-markering-knop (filly-brein hfst 9.7): eigenaar
//     kan markeren "viel buiten controle" met reden, zodat de
//     campagne uit Filly's leerloop valt
//
// States:
//   - loading: skeleton-blokken
//   - geen rij (performance=null): "Nog geen meet-data" + uitleg
//   - rij maar classification=null: "Meet-window loopt (14 dagen)"
//   - geclassificeerd: volledige tegel met score + acties
// ============================================================

type Props = {
  campaignId: string;
};

const CLASSIFICATION_LABELS: Record<CampaignClassification, string> = {
  winner: "Winner",
  average: "Average",
  underperformer: "Underperformer",
  no_data: "Geen data",
};

const CLASSIFICATION_VARIANTS: Record<
  CampaignClassification,
  "success" | "warning" | "danger" | "neutral"
> = {
  winner: "success",
  average: "warning",
  underperformer: "danger",
  no_data: "neutral",
};

// Score-kleur conform health-score-pagina-conventie.
function scoreColor(score: number | null): string {
  if (score == null) return "var(--text-secondary, #52525B)";
  if (score >= 80) return "var(--success, #16A34A)";
  if (score >= 50) return "var(--warning, #D97706)";
  return "var(--danger, #DC2626)";
}

function formatPercent(numerator: number | null, denominator: number | null): string {
  if (!numerator || !denominator || denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function CampaignPerformanceCard({ campaignId }: Props) {
  const [data, setData] = useState<CampaignPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Outlier-modal-state. Compact inline, geen apart modaal.
  const [outlierMode, setOutlierMode] = useState(false);
  const [outlierReason, setOutlierReason] = useState("");
  const [outlierSaving, setOutlierSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCampaignPerformance(campaignId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fout");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const handleMarkOutlier = async () => {
    if (!outlierReason.trim()) return;
    setOutlierSaving(true);
    try {
      await markCampaignOutlier(campaignId, outlierReason.trim());
      setData((prev) =>
        prev
          ? {
              ...prev,
              marked_outlier: true,
              marked_outlier_reason: outlierReason.trim(),
              marked_outlier_at: new Date().toISOString(),
            }
          : prev,
      );
      setOutlierMode(false);
      setOutlierReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outlier-markering faalde");
    } finally {
      setOutlierSaving(false);
    }
  };

  const handleUnmarkOutlier = async () => {
    setOutlierSaving(true);
    try {
      await unmarkCampaignOutlier(campaignId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              marked_outlier: false,
              marked_outlier_reason: null,
              marked_outlier_at: null,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Herroepen faalde");
    } finally {
      setOutlierSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody>
          <div
            style={{
              height: 100,
              background: "var(--surface-muted, #F4F0E8)",
              borderRadius: 8,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </CardBody>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardBody>
          <div
            style={{
              fontSize: 13,
              color: "var(--danger, #DC2626)",
            }}
          >
            Kon performance-data niet laden: {error}
          </div>
        </CardBody>
      </Card>
    );
  }

  // Geen performance-rij: campagne is nog niet actief geweest, of is
  // van vóór migratie 0046.
  if (!data) {
    return (
      <Card>
        <CardBody>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
              color: "var(--text, #18181B)",
            }}
          >
            Performance
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
            }}
          >
            Nog geen meet-data. Performance wordt vastgelegd zodra de
            campagne 'actief' wordt en Resend-events binnenkomen
            (delivered, opens, clicks). Reserveringen die via deze
            campagne komen worden hier ook geteld.
          </div>
        </CardBody>
      </Card>
    );
  }

  const classification = data.classification;
  const score = data.success_score;
  const measurementOpen = !classification && !data.measurement_complete_at;

  // Mail-rates (geformatteerd).
  const openRate = formatPercent(data.mail_opened, data.mail_delivered);
  const clickRate = formatPercent(data.mail_clicked, data.mail_delivered);
  const bounceRate = formatPercent(data.mail_bounced, data.mail_delivered);

  return (
    <Card>
      <CardBody>
        {/* Header: score + classification-badge + outlier-status */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text, #18181B)",
                marginBottom: 4,
              }}
            >
              Performance
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              {score !== null ? (
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: scoreColor(score),
                    lineHeight: 1,
                  }}
                >
                  {score}
                  <span
                    style={{
                      fontSize: 14,
                      color: "var(--text-secondary, #52525B)",
                      marginLeft: 4,
                    }}
                  >
                    / 100
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 16,
                    color: "var(--text-secondary, #52525B)",
                  }}
                >
                  {measurementOpen
                    ? "Meet-window loopt (14 dagen)"
                    : "Geen score"}
                </div>
              )}
              {classification && (
                <Badge variant={CLASSIFICATION_VARIANTS[classification]}>
                  {CLASSIFICATION_LABELS[classification]}
                </Badge>
              )}
              {data.marked_outlier && (
                <Badge variant="neutral">Outlier (geen leerinput)</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Mail-metrics */}
        {(data.mail_delivered ?? 0) > 0 && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary, #52525B)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Mail
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "var(--space-2)",
              }}
            >
              <MetricCell label="Verzonden" value={String(data.mail_delivered ?? 0)} />
              <MetricCell label="Geopend" value={`${data.mail_opened ?? 0} (${openRate})`} />
              <MetricCell label="Geklikt" value={`${data.mail_clicked ?? 0} (${clickRate})`} />
              <MetricCell
                label="Bounced"
                value={`${data.mail_bounced ?? 0} (${bounceRate})`}
              />
            </div>
          </div>
        )}

        {/* Conversie */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary, #52525B)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Conversie
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "var(--space-2)",
            }}
          >
            <MetricCell
              label="Reserveringen"
              value={String(data.reservations_attributed)}
            />
            <MetricCell
              label="Gasten"
              value={String(data.guests_attributed)}
            />
            {data.revenue_attributed_cents > 0 && (
              <MetricCell
                label="Omzet"
                value={`€ ${(data.revenue_attributed_cents / 100).toFixed(0)}`}
              />
            )}
          </div>
        </div>

        {/* Outlier-actie (collapse-pattern). Verschijnt onderaan tegel. */}
        <div
          style={{
            borderTop: "1px solid var(--border, #E4E4E7)",
            paddingTop: "var(--space-3)",
            marginTop: "var(--space-3)",
          }}
        >
          {!data.marked_outlier && !outlierMode && (
            <button
              type="button"
              onClick={() => setOutlierMode(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary, #52525B)",
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Markeer als outlier ("viel buiten controle")
            </button>
          )}
          {!data.marked_outlier && outlierMode && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                Waarom valt deze campagne buiten je controle? Reden komt
                in Filly's leerloop als context (bv. "slecht weer",
                "staking", "atypisch evenement").
              </div>
              <input
                type="text"
                value={outlierReason}
                onChange={(e) => setOutlierReason(e.target.value)}
                placeholder="Bv. slecht weer, staking, etc."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--border, #E4E4E7)",
                  borderRadius: 6,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="brand-soft"
                  onClick={handleMarkOutlier}
                  disabled={outlierSaving || !outlierReason.trim()}
                >
                  {outlierSaving ? "Bezig…" : "Markeer outlier"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOutlierMode(false);
                    setOutlierReason("");
                  }}
                  disabled={outlierSaving}
                >
                  Annuleer
                </Button>
              </div>
            </div>
          )}
          {data.marked_outlier && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                Gemarkeerd als outlier
                {data.marked_outlier_reason
                  ? `: "${data.marked_outlier_reason}"`
                  : ""}
                . Filly negeert deze campagne in zijn leerloop.
              </div>
              <Button
                variant="secondary"
                onClick={handleUnmarkOutlier}
                disabled={outlierSaving}
              >
                {outlierSaving ? "Bezig…" : "Herroep outlier-markering"}
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Compact "label boven / waarde onder"-celletje voor metric-grids. */
function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary, #52525B)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text, #18181B)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
