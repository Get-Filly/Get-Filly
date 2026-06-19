"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchGoogleProfileMine,
  type GoogleProfileMine,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * ============================================================
 * Google Business Profile, hub-pagina (dynamisch sinds 2026-05-05)
 * ============================================================
 *
 * Drie visuele states bovenaan, gestuurd door GET /google-profile/me:
 *   - loading       , skelet met grijze blokjes
 *   - !connected    , blauwe banner + "Koppel met Google"-knop
 *   - connected     , groene banner + profielinfo + Vernieuw + Ontkoppel
 *
 * 4 feature-cards eronder (per 2026-05-29 ingedikt): Identiteit,
 * Reviews, Health-score (alle live) + Google Business Profiel
 * (Coming Soon tot fase D-F: OAuth + Google approval).
 *
 * Verwijderd als aparte tegel: Concurrent-benchmark (zit al in de
 * Health-score), Foto-sync en Inzichten.
 *
 * Reviews-card werkt onafhankelijk van de Google-koppeling, Filly's
 * reply-engine draait al op handmatig ingevoerde reviews. Pas in fase E
 * komt automatische review-sync vanuit Google.
 * ============================================================
 */

type FeatureStatus =
  | "live" // klikbaar, werkt direct
  | "live-when-connected" // klikbaar als connected, anders Coming Soon
  | "coming-soon-oauth"; // wacht op fase D-F

// Per 2026-05-21: emoji-icoon weggehaald uit feature-cards (Floris-
// keuze: cleaner zonder afleidende symbolen). Layout aangepast naar
// "titel links + status-badge rechts".
type Feature = {
  key: string;
  titleKey: string;
  descriptionKey: string;
  href?: string;
  status: FeatureStatus;
  phaseLabelKey: string;
};

const features: Feature[] = [
  // Identiteit is bron-van-waarheid voor Filly's posts. Hoort daarom
  // als EERSTE card binnen Vindbaarheid (was eerder onder account-
  // instellingen, daar logisch verkeerd).
  {
    key: "identiteit",
    titleKey: "identityTitle",
    descriptionKey: "identityDescription",
    href: "/dashboard/google-business/identiteit",
    status: "live",
    phaseLabelKey: "available",
  },
  {
    key: "reviews",
    titleKey: "reviewsTitle",
    descriptionKey: "reviewsDescription",
    href: "/dashboard/google-business/reviews",
    status: "live",
    phaseLabelKey: "available",
  },
  {
    key: "audit",
    titleKey: "auditTitle",
    descriptionKey: "auditDescription",
    href: "/dashboard/google-business/audit",
    // SEO + GEO werken óók zonder GBP-koppeling, dus altijd klikbaar.
    // GBP-checks tonen dan een fix-link naar Account → Koppelingen.
    status: "live",
    phaseLabelKey: "available",
  },
  // Concurrent-benchmark is GEEN aparte tegel meer (2026-05-29): de
  // buurt-vergelijking zit al in de Health-score (CompetitorCollector,
  // 500m straal). De losse /benchmark-route blijft voorlopig bestaan
  // maar wordt niet meer vanaf de hub gelinkt.
  {
    key: "edits",
    titleKey: "editsTitle",
    descriptionKey: "editsDescription",
    // Wél een href: de preview-pagina is nu al te bekijken (gevuld met
    // Places-data), ook al is bewerken pas mogelijk na OAuth.
    href: "/dashboard/google-business/profiel",
    status: "coming-soon-oauth",
    phaseLabelKey: "requiresGoogleConnection",
  },
];

function statusBadge(
  status: FeatureStatus,
  phaseLabel: string,
  isConnected: boolean,
  availableLabel: string,
) {
  if (status === "live") {
    return <Badge variant="success" withDot>{phaseLabel}</Badge>;
  }
  if (status === "live-when-connected") {
    if (isConnected) {
      return <Badge variant="success" withDot>{availableLabel}</Badge>;
    }
    return <Badge variant="info">{phaseLabel}</Badge>;
  }
  return <Badge variant="neutral">{phaseLabel}</Badge>;
}

export default function GoogleBusinessHubPage() {
  const t = useTranslations("dash_google_business_page");
  const { active } = useRestaurant();
  const [mine, setMine] = useState<GoogleProfileMine | null>(null);

  // Per 2026-05-21 (Floris-keuze): de Google-koppeling-banner +
  // GoogleConnectModal zijn verwijderd uit deze hub. De koppeling
  // (zoeken + verbinden + ontkoppelen) wordt beheerd via Account →
  // Koppelingen. Hier laden we alleen nog `mine` om te weten of de
  // "live-when-connected"-cards klikbaar mogen zijn — geen UI om
  // status te tonen of te wijzigen.
  useEffect(() => {
    let cancelled = false;
    fetchGoogleProfileMine()
      .then((data) => {
        if (!cancelled) setMine(data);
      })
      .catch(() => {
        // Silent fail: cards-states tonen "Beschikbaar na koppeling"
        // wat ook prima leesbaar is zonder echte status-data.
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  const isConnected = mine?.connected ?? false;

  return (
    <div className="page-full">
      <PageHeader title={t("pageTitle")} />


      {/* 7 feature-cards. live-when-connected wordt klikbaar als
          connected. coming-soon-oauth blijft altijd disabled tot fase F. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {features.map((f) => {
          const isClickable =
            (f.status === "live" && f.href) ||
            (f.status === "live-when-connected" && isConnected && f.href) ||
            // coming-soon-oauth mét href = preview-pagina is al te
            // bekijken (bewerken pas na koppeling). Bv. Google Business
            // Profiel: read-only Places-data nu, bewerken later.
            (f.status === "coming-soon-oauth" && !!f.href);
          const cardContent = (
            <Card
              elevated
              style={{
                height: "100%",
                opacity: isClickable ? 1 : 0.85,
                cursor: isClickable ? "pointer" : "default",
                transition: "transform 120ms ease, box-shadow 120ms ease",
              }}
              className={isClickable ? "ui-card--hoverable" : undefined}
            >
              <CardBody>
                {/* Top-row: titel links + status-badge rechts. Vroeger
                    stond hier ook een emoji-icoon links; per 2026-05-21
                    weggehaald voor een rustiger look. */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 16,
                      color: "var(--text, #18181B)",
                    }}
                  >
                    {t(f.titleKey)}
                  </div>
                  {statusBadge(
                    f.status,
                    t(f.phaseLabelKey),
                    isConnected,
                    t("available"),
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary, #52525B)",
                    lineHeight: 1.5,
                  }}
                >
                  {t(f.descriptionKey)}
                </div>
              </CardBody>
            </Card>
          );

          if (isClickable && f.href) {
            return (
              <Link
                key={f.key}
                href={f.href}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {cardContent}
              </Link>
            );
          }
          return <div key={f.key}>{cardContent}</div>;
        })}
      </div>
    </div>
  );
}
