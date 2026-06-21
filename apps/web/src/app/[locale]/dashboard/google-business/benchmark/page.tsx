"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fetchGoogleProfileCompetitors,
  fetchGoogleProfileMine,
  type CompetitorPlace,
  type GooglePlaceDetails,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";
import { useLocaleTag } from "@/lib/locale-format";

/**
 * ============================================================
 * Concurrent-benchmark pagina (fase B)
 * ============================================================
 *
 * Vergelijkt jouw Google-profiel met andere restaurants binnen X meter.
 *
 * Layout:
 *   - Top: 4 KPI-tegels (jouw rating / median-rating in buurt /
 *     jouw review-count / median review-count). Geeft direct
 *     "doe ik het goed of slecht?".
 *   - Daaronder: tabel met alle concurrenten gesorteerd op afstand.
 *     Eerste rij = jouw eigen zaak (highlight) zodat je kunt zien
 *     waar je staat in de buurt.
 *   - Radius-selector boven tabel (250m / 500m / 1km / 2km / 3km).
 *
 * Twee parallel-fetches bij mount: jouw eigen profile + competitors-
 * list. We hebben beide nodig om de eigen rij in de tabel te tonen.
 * ============================================================
 */

const RADIUS_OPTIONS = [
  { value: 250, label: "250 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 3000, label: "3 km" },
];

export default function ConcurrentBenchmarkPage() {
  const t = useTranslations("dash_google_business_benchmark_page");
  const localeTag = useLocaleTag();
  const { active } = useRestaurant();
  const [mine, setMine] = useState<GooglePlaceDetails | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorPlace[]>([]);
  const [radius, setRadius] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotConnected(false);

    Promise.all([
      fetchGoogleProfileMine(),
      fetchGoogleProfileCompetitors(radius),
    ])
      .then(([mineRes, compRes]) => {
        if (cancelled) return;
        if (!mineRes.connected || !mineRes.data) {
          setNotConnected(true);
          return;
        }
        setMine(mineRes.data);
        setCompetitors(compRes);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : t("errors.unknown");
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
  }, [active?.id, radius, t]);

  if (loading) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div
          style={{
            padding: "var(--space-4)",
            backgroundColor: "var(--color-surface-muted, #F4F4F5)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary, #52525B)",
            fontSize: 13,
          }}
        >
          {t("loading")}
        </div>
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState
          icon="🔵"
          title={t("notConnected.title")}
          description={t("notConnected.description")}
          action={
            <Link href="/dashboard/google-business">
              <Button variant="primary">{t("notConnected.action")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !mine) {
    return (
      <div className="page-full">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
          {error ?? t("errors.unavailable")}
        </div>
      </div>
    );
  }

  // Statistieken berekenen op de competitors-set (zonder jouzelf,
  // backend filtert eigen place_id al uit de response).
  const ratings = competitors
    .map((c) => c.rating)
    .filter((r): r is number => r !== null);
  const reviewCounts = competitors
    .map((c) => c.userRatingCount)
    .filter((c): c is number => c !== null);
  const photoCounts = competitors.map((c) => c.photoCount);

  const medianRating = median(ratings);
  const medianReviews = median(reviewCounts);
  const medianPhotos = median(photoCounts);

  return (
    <div className="page-full">
      <PageHeader
        title={t("title")}
        subtitle={t("resultSubtitle", {
          count: competitors.length,
          radius:
            radius >= 1000 ? `${radius / 1000} km` : `${radius} m`,
        })}
      />

      {/* Radius-selector boven de KPI-tegels, verandert direct de
          fetch via useEffect-dep. */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
            marginRight: "var(--space-2)",
          }}
        >
          {t("radiusLabel")}
        </span>
        {RADIUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRadius(opt.value)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border, #E4E4E7)",
              backgroundColor:
                radius === opt.value
                  ? "var(--color-brand, #1F4A2D)"
                  : "white",
              color:
                radius === opt.value ? "white" : "var(--text, #18181B)",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 3 KPI-tegels: jouw cijfer vs de mediaan in de buurt.
          Mediaan is robuuster dan gemiddelde tegen één super-zaak die
          de vergelijking scheef trekt. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-5)",
        }}
      >
        <KpiTile
          label={t("kpi.rating")}
          mineValue={mine.rating}
          medianValue={medianRating}
          format={(v) => v.toFixed(1)}
          higherIsBetter
        />
        <KpiTile
          label={t("kpi.reviews")}
          mineValue={mine.userRatingCount}
          medianValue={medianReviews}
          format={(v) => v.toLocaleString(localeTag)}
          higherIsBetter
        />
        <KpiTile
          label={t("kpi.photos")}
          mineValue={mine.photos.length}
          medianValue={medianPhotos}
          format={(v) => v.toString()}
          higherIsBetter
        />
      </div>

      {/* Tabel, eerst jouw eigen zaak (highlight), dan de buren
          gesorteerd op afstand. Backend levert al gesorteerd. */}
      <Card noPadding>
        <div style={{ overflowX: "auto" }}>
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
                <th style={{ padding: "10px 12px" }}>{t("table.restaurant")}</th>
                <th style={{ padding: "10px 12px" }}>{t("table.distance")}</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.rating")}
                </th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.reviews")}
                </th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>
                  {t("table.photos")}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Jouw eigen zaak bovenaan, gehighlight */}
              <tr
                style={{
                  backgroundColor: "#F0F7F2",
                  borderBottom: "1px solid var(--color-border, #E4E4E7)",
                  fontWeight: 600,
                }}
              >
                <td style={{ padding: "12px" }}>
                  <span style={{ marginRight: "var(--space-2)" }}>📍</span>
                  {mine.displayName}
                  <span
                    style={{
                      marginLeft: "var(--space-2)",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--color-brand, #1F4A2D)",
                    }}
                  >
                    {t("youBadge")}
                  </span>
                </td>
                <td style={{ padding: "12px" }}>—</td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {mine.rating !== null ? `⭐ ${mine.rating.toFixed(1)}` : "—"}
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {mine.userRatingCount !== null
                    ? mine.userRatingCount.toLocaleString(localeTag)
                    : "—"}
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                  {mine.photos.length}
                </td>
              </tr>
              {competitors.map((c) => (
                <tr
                  key={c.placeId}
                  style={{
                    borderBottom: "1px solid var(--color-border, #E4E4E7)",
                  }}
                >
                  <td style={{ padding: "12px" }}>
                    <div
                      style={{
                        fontWeight: 500,
                        color: "var(--text, #18181B)",
                      }}
                    >
                      {c.displayName}
                    </div>
                    {c.primaryType && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary, #52525B)",
                          marginTop: 2,
                          textTransform: "capitalize",
                        }}
                      >
                        {c.primaryType.replace(/_/g, " ")}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      color: "var(--text-secondary, #52525B)",
                    }}
                  >
                    {c.distanceMeters !== null
                      ? c.distanceMeters >= 1000
                        ? `${(c.distanceMeters / 1000).toFixed(1)} km`
                        : `${c.distanceMeters} m`
                      : "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {c.rating !== null ? `⭐ ${c.rating.toFixed(1)}` : "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {c.userRatingCount !== null
                      ? c.userRatingCount.toLocaleString(localeTag)
                      : "—"}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {c.photoCount}
                  </td>
                </tr>
              ))}
              {competitors.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "var(--space-6) var(--space-4)",
                      textAlign: "center",
                      color: "var(--text-secondary, #52525B)",
                      fontStyle: "italic",
                    }}
                  >
                    {t("emptyTable")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div
        style={{
          marginTop: "var(--space-4)",
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          textAlign: "center",
        }}
      >
        {t("medianNote", { count: competitors.length })}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  mineValue,
  medianValue,
  format,
  higherIsBetter,
}: {
  label: string;
  mineValue: number | null;
  medianValue: number | null;
  format: (v: number) => string;
  higherIsBetter: boolean;
}) {
  const t = useTranslations("dash_google_business_benchmark_page");
  const isBetter =
    mineValue !== null &&
    medianValue !== null &&
    (higherIsBetter ? mineValue > medianValue : mineValue < medianValue);
  const isWorse =
    mineValue !== null &&
    medianValue !== null &&
    (higherIsBetter ? mineValue < medianValue : mineValue > medianValue);

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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--text, #18181B)",
            lineHeight: 1,
          }}
        >
          {mineValue !== null ? format(mineValue) : "—"}
        </div>
        {isBetter && (
          <Badge variant="success" withDot>
            {t("aboveMedian")}
          </Badge>
        )}
        {isWorse && <Badge variant="warning">{t("belowMedian")}</Badge>}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary, #52525B)",
          marginTop: 8,
        }}
      >
        {t("medianInArea", {
          value: medianValue !== null ? format(medianValue) : "—",
        })}
      </div>
    </div>
  );
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
