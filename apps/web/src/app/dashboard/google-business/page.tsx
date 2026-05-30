"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../../components/ui/page-header";
import { Card, CardBody } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import {
  fetchGoogleProfileMine,
  type GoogleProfileMine,
} from "../../../lib/api";
import { useRestaurant } from "../../../lib/restaurant-context";

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
  title: string;
  description: string;
  href?: string;
  status: FeatureStatus;
  phaseLabel: string;
};

const features: Feature[] = [
  // Identiteit is bron-van-waarheid voor Filly's posts. Hoort daarom
  // als EERSTE card binnen Vindbaarheid (was eerder onder account-
  // instellingen, daar logisch verkeerd).
  {
    key: "identiteit",
    title: "Identiteit",
    description:
      "Bron-van-waarheid voor alle posts en campagnes die Filly maakt. Tagline, toon, doelgroep, trefwoorden, menukaart en meer.",
    href: "/dashboard/google-business/identiteit",
    status: "live",
    phaseLabel: "Beschikbaar",
  },
  {
    key: "reviews",
    title: "Reviews",
    description:
      "Bekijk reviews en laat Filly antwoord-suggesties schrijven die passen bij jouw onderneming.",
    href: "/dashboard/google-business/reviews",
    status: "live",
    phaseLabel: "Beschikbaar",
  },
  {
    key: "audit",
    title: "Health-score",
    description:
      "Compleet vindbaarheids-rapport: SEO van je website, kwaliteit van je Google Business Profile, reviews, AI-zichtbaarheid en concurrentie in 500m straal.",
    href: "/dashboard/google-business/audit",
    // SEO + GEO werken óók zonder GBP-koppeling, dus altijd klikbaar.
    // GBP-checks tonen dan een fix-link naar Account → Koppelingen.
    status: "live",
    phaseLabel: "Beschikbaar",
  },
  // Concurrent-benchmark is GEEN aparte tegel meer (2026-05-29): de
  // buurt-vergelijking zit al in de Health-score (CompetitorCollector,
  // 500m straal). De losse /benchmark-route blijft voorlopig bestaan
  // maar wordt niet meer vanaf de hub gelinkt.
  {
    key: "edits",
    title: "Google Business Profiel",
    description:
      "Bekijk je volledige Google-profiel: openingstijden, beschrijving, contactgegevens en attributen. Bewerken + pushen naar Google komt zodra de koppeling live is.",
    // Wél een href: de preview-pagina is nu al te bekijken (gevuld met
    // Places-data), ook al is bewerken pas mogelijk na OAuth.
    href: "/dashboard/google-business/profiel",
    status: "coming-soon-oauth",
    phaseLabel: "Vereist Google-koppeling",
  },
];

function statusBadge(status: FeatureStatus, phaseLabel: string, isConnected: boolean) {
  if (status === "live") {
    return <Badge variant="success" withDot>{phaseLabel}</Badge>;
  }
  if (status === "live-when-connected") {
    if (isConnected) {
      return <Badge variant="success" withDot>Beschikbaar</Badge>;
    }
    return <Badge variant="info">{phaseLabel}</Badge>;
  }
  return <Badge variant="neutral">{phaseLabel}</Badge>;
}

export default function GoogleBusinessHubPage() {
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
      <PageHeader title="Vindbaarheid" />


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
                    {f.title}
                  </div>
                  {statusBadge(f.status, f.phaseLabel, isConnected)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary, #52525B)",
                    lineHeight: 1.5,
                  }}
                >
                  {f.description}
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
