"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "../../_components/skeleton";
import {
  fetchGoogleProfileMine,
  fetchRestaurant,
  type GooglePlaceDetails,
  type GoogleProfileMine,
  type Restaurant,
} from "@/lib/api";

// ============================================================
// /dashboard/google-business/profiel — Google Business Profiel preview
// ============================================================
//
// Doel (Floris-wens 2026-05-29): alvast laten zien WAT er straks op
// deze pagina staat, zodat zodra de Google Business Profile OAuth live
// is (fase E/F) de structuur al klaar is en alleen de bewerk-acties
// hoeven te worden aangezet.
//
// Wat NU werkt: alle read-only velden worden gevuld met de openbare
// Google-Maps-data die we al via de Places API cachen
// (restaurants.google_place_data, mig 0034). Zo ziet de eigenaar
// meteen z'n echte profiel-gegevens.
//
// Wat na de koppeling komt: bewerken van die velden (push naar Google)
// + features die de Places API niet geeft (posts, Q&A, inzichten,
// foto-upload). Die staan hier als "Beschikbaar na koppeling"-blokken
// zodat de roadmap zichtbaar is.
//
// De koppeling zelf wordt beheerd via Account → Koppelingen (net als
// bij de andere Vindbaarheid-features); deze pagina toont 'm alleen.
// ============================================================

// Mapt Google's primaryType (bv. "italian_restaurant") naar iets
// leesbaars. Beperkte set — onbekende types tonen we opgeschoond
// (underscores → spaties).
function prettyType(type: string | null): string {
  if (!type) return "—";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Eén veld-rij: label links, waarde rechts. value null/leeg → "—".
function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        padding: "10px 0",
        borderBottom: "1px solid var(--border, #E5DFD0)",
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--tl, #6B6F71)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          color: "var(--text, #18181B)",
          textAlign: "right",
          fontWeight: 500,
        }}
      >
        {value && value.trim() ? value : "—"}
      </span>
    </div>
  );
}

// Sectie-kop met titel + een badge die de databron/status aangeeft.
function SectionCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card elevated style={{ marginBottom: "var(--space-4)" }}>
      <CardBody>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "var(--space-2)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
          {badge}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

// Formatteert een ISO-datum (YYYY-MM-DD) naar leesbaar NL, bv.
// "25 december 2026". Faalt stil terug op de ruwe string.
function formatClosedDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function GoogleProfilePreviewPage() {
  const t = useTranslations("dash_google_business_profiel_page");
  // Badge: read-only data die we nu al hebben.
  const visibleBadge = <Badge variant="success">{t("badge.visible")}</Badge>;
  // Badge: veld is leesbaar maar aanpassen + pushen naar Google vereist de
  // OAuth-koppeling (fase E/F).
  const editLaterBadge = (
    <Badge variant="neutral">{t("badge.editLater")}</Badge>
  );
  // Badge: feature bestaat alleen ná koppeling (geen Places-equivalent).
  const afterConnectBadge = (
    <Badge variant="neutral">{t("badge.afterConnect")}</Badge>
  );

  const [mine, setMine] = useState<GoogleProfileMine | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchGoogleProfileMine(), fetchRestaurant()])
      .then(([mineRes, restRes]) => {
        if (cancelled) return;
        if (mineRes.status === "fulfilled") setMine(mineRes.value);
        if (restRes.status === "fulfilled") setRestaurant(restRes.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const p: GooglePlaceDetails | null = mine?.data ?? null;
  const connected = mine?.connected ?? false;

  // Speciale dagen / sluitingsdata uit account-instellingen. Alleen
  // datums van vandaag of later tonen (verleden is niet relevant voor
  // Google's special hours), oplopend gesorteerd.
  const todayIso = new Date().toISOString().slice(0, 10);
  const closedDates = (restaurant?.closed_dates ?? [])
    .filter((d) => d >= todayIso)
    .sort();

  return (
    <div className="page-full">
      <Link
        href="/dashboard/google-business"
        style={{
          fontSize: 13,
          color: "var(--ts)",
          textDecoration: "none",
          marginBottom: 14,
          display: "inline-block",
        }}
      >
        {t("backToFindability")}
      </Link>
      <PageHeader title={t("title")} />

      {/* Uitleg-banner: wat zien we nu vs wat komt er na de koppeling. */}
      <div
        style={{
          padding: "12px 16px",
          marginBottom: "var(--space-4)",
          background: "var(--color-white, #FFFFFF)",
          border: "1px solid var(--border, #E5DFD0)",
          borderRadius: "var(--rs, 8px)",
          boxShadow: "inset 4px 0 0 0 #1F4A2D",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text, #18181B)",
        }}
      >
        <strong>
          {connected ? t("banner.titleConnected") : t("banner.titlePreview")}
        </strong>{" "}
        {t.rich("banner.body", {
          link: (chunks) => (
            <Link
              href="/dashboard/account?tab=koppelingen"
              style={{
                color: "var(--color-brand, #1F4A2D)",
                fontWeight: 600,
              }}
            >
              {chunks}
            </Link>
          ),
        })}
      </div>

      {loading ? (
        <>
          <Skeleton style={{ height: 160, marginBottom: 16 }} />
          <Skeleton style={{ height: 160, marginBottom: 16 }} />
        </>
      ) : (
        <>
          {/* ---- Basisgegevens (Places read-only, bewerken na OAuth) ---- */}
          <SectionCard title={t("basics.title")} badge={editLaterBadge}>
            <FieldRow label={t("basics.name")} value={p?.displayName} />
            <FieldRow label={t("basics.category")} value={prettyType(p?.primaryType ?? null)} />
            <FieldRow label={t("basics.phone")} value={p?.internationalPhoneNumber} />
            <FieldRow label={t("basics.website")} value={p?.websiteUri} />
            <FieldRow label={t("basics.address")} value={p?.formattedAddress} />
          </SectionCard>

          {/* ---- Openingstijden ---- */}
          <SectionCard title={t("hours.title")} badge={editLaterBadge}>
            {p?.regularOpeningHours?.weekdayDescriptions?.length ? (
              p.regularOpeningHours.weekdayDescriptions.map((d, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border, #E5DFD0)",
                    fontSize: 14,
                  }}
                >
                  {d}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t("hours.empty")}
              </div>
            )}
          </SectionCard>

          {/* ---- Speciale dagen / sluitingsdata (uit account) ---- */}
          {/* Deze komen uit Account → Sluitingsdata & vakanties en
              worden straks gepusht naar Google's 'special hours'
              (afwijkende openingstijden op feestdagen/vakanties). */}
          <SectionCard
            title={t("specialDays.title")}
            badge={editLaterBadge}
          >
            {closedDates.length > 0 ? (
              <>
                {closedDates.map((d) => (
                  <FieldRow
                    key={d}
                    label={formatClosedDate(d)}
                    value={t("specialDays.closed")}
                  />
                ))}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl, #6B6F71)",
                    marginTop: 10,
                  }}
                >
                  {t.rich("specialDays.manage", {
                    link: (chunks) => (
                      <Link
                        href="/dashboard/account"
                        style={{
                          color: "var(--color-brand, #1F4A2D)",
                          fontWeight: 600,
                        }}
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
                {t.rich("specialDays.empty", {
                  link: (chunks) => (
                    <Link
                      href="/dashboard/account"
                      style={{
                        color: "var(--color-brand, #1F4A2D)",
                        fontWeight: 600,
                      }}
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </div>
            )}
          </SectionCard>

          {/* ---- Beschrijving ---- */}
          <SectionCard title={t("description.title")} badge={editLaterBadge}>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: p?.editorialSummary
                  ? "var(--text, #18181B)"
                  : "var(--tl, #6B6F71)",
              }}
            >
              {p?.editorialSummary ?? t("description.empty")}
            </div>
          </SectionCard>

          {/* ---- Status & cijfers (puur read-only, Google bepaalt deze) ---- */}
          <SectionCard title={t("stats.title")} badge={visibleBadge}>
            <FieldRow
              label={t("stats.businessStatus")}
              value={
                p?.businessStatus === "OPERATIONAL"
                  ? t("stats.statusOperational")
                  : p?.businessStatus ?? null
              }
            />
            <FieldRow
              label={t("stats.rating")}
              value={p?.rating != null ? `${p.rating} ★` : null}
            />
            <FieldRow
              label={t("stats.reviewCount")}
              value={
                p?.userRatingCount != null ? `${p.userRatingCount}` : null
              }
            />
            <FieldRow
              label={t("stats.photos")}
              value={p?.photos?.length ? `${p.photos.length}` : null}
            />
          </SectionCard>

          {/* ---- Alleen na koppeling: GBP-only features ---- */}
          <SectionCard
            title={t("posts.title")}
            badge={afterConnectBadge}
          >
            <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
              {t("posts.body")}
            </div>
          </SectionCard>

          <SectionCard title={t("qa.title")} badge={afterConnectBadge}>
            <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
              {t("qa.body")}
            </div>
          </SectionCard>

          <SectionCard title={t("insights.title")} badge={afterConnectBadge}>
            <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
              {t("insights.body")}
            </div>
          </SectionCard>

          <SectionCard title={t("photoManagement.title")} badge={afterConnectBadge}>
            <div style={{ fontSize: 14, color: "var(--tl, #6B6F71)" }}>
              {t("photoManagement.body")}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
