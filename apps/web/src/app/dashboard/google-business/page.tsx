"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../../components/ui/page-header";
import { Card, CardBody } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  fetchGoogleProfileMine,
  refreshGoogleProfile,
  disconnectGoogleProfile,
  type GoogleProfileMine,
  type GooglePlaceDetails,
} from "../../../lib/api";
import { useRestaurant } from "../../../lib/restaurant-context";
import { GoogleConnectModal } from "./_components/google-connect-modal";

/**
 * ============================================================
 * Google Business Profile — hub-pagina (dynamisch sinds 2026-05-05)
 * ============================================================
 *
 * Drie visuele states bovenaan, gestuurd door GET /google-profile/me:
 *   - loading        — skelet met grijze blokjes
 *   - !connected     — blauwe banner + "Koppel met Google"-knop
 *   - connected      — groene banner + profielinfo + Vernieuw + Ontkoppel
 *
 * 7 feature-cards eronder. De drie fase-B-features (audit / benchmark /
 * posts) worden klikbaar zodra connected; daarvoor blijven ze Coming Soon.
 * De drie fase-F-features (edits / foto-sync / inzichten) blijven Coming
 * Soon tot fase D-F live gaan (vereist OAuth + Google approval).
 *
 * Reviews-card werkt onafhankelijk van de Google-koppeling — Filly's
 * reply-engine draait al op handmatig ingevoerde reviews. Pas in fase E
 * komt automatische review-sync vanuit Google.
 * ============================================================
 */

type FeatureStatus =
  | "live" // klikbaar, werkt direct
  | "live-when-connected" // klikbaar als connected, anders Coming Soon
  | "coming-soon-oauth"; // wacht op fase D-F

type Feature = {
  key: string;
  icon: string;
  title: string;
  description: string;
  href?: string;
  status: FeatureStatus;
  phaseLabel: string;
};

const features: Feature[] = [
  {
    key: "reviews",
    icon: "⭐",
    title: "Reviews",
    description:
      "Bekijk reviews en laat Filly antwoord-suggesties schrijven die passen bij jouw zaak.",
    href: "/dashboard/google-business/reviews",
    status: "live",
    phaseLabel: "Beschikbaar",
  },
  {
    key: "audit",
    icon: "🔍",
    title: "Profiel-audit",
    description:
      "Filly checkt automatisch wat ontbreekt op je Google-profiel: foto's, openingstijden, beschrijving, attributen.",
    href: "/dashboard/google-business/audit",
    status: "live-when-connected",
    phaseLabel: "Beschikbaar na koppeling",
  },
  {
    key: "benchmark",
    icon: "📊",
    title: "Concurrent-benchmark",
    description:
      "Vergelijk je sterren-rating, review-aantal en foto-volume met restaurants in jouw buurt.",
    href: "/dashboard/google-business/benchmark",
    status: "live-when-connected",
    phaseLabel: "Beschikbaar na koppeling",
  },
  {
    key: "edits",
    icon: "✍️",
    title: "Profiel-edits",
    description:
      "Wijzigingen aan openingstijden, beschrijving en attributen rechtstreeks pushen naar Google — met jouw goedkeuring.",
    status: "coming-soon-oauth",
    phaseLabel: "Vereist Google-koppeling",
  },
  {
    key: "photo-sync",
    icon: "📷",
    title: "Foto-sync naar Google",
    description:
      "Foto's uit je Filly-bibliotheek automatisch publiceren op je Google-profiel.",
    status: "coming-soon-oauth",
    phaseLabel: "Vereist Google-koppeling",
  },
  {
    key: "insights",
    icon: "📈",
    title: "Inzichten",
    description:
      "Hoeveel mensen zoeken jouw zaak, klikken naar je website of bellen je nummer — direct uit Google.",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // disconnecting is een aparte loading-state zodat de Vernieuw-knop
  // niet flikkert tijdens een delete. Beide knoppen kunnen niet
  // tegelijk actief zijn omdat ze elkaar disabelen.
  const [disconnecting, setDisconnecting] = useState(false);

  // Initial load + reload bij restaurant-switch (bv. via workspace-
  // dropdown). Gebruik active.id als dep zodat data fresh is per tenant.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGoogleProfileMine()
      .then((data) => {
        if (!cancelled) setMine(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kon status niet laden.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  function handleConnected(data: GooglePlaceDetails) {
    setMine({
      connected: true,
      data,
      syncedAt: new Date().toISOString(),
    });
  }

  // Ontkoppel-flow: native confirm i.p.v. custom modal — past bij de
  // andere "delete-flow"-patronen in de codebase (gasten-pagina,
  // chat-history etc.) en is goed genoeg voor een eigenaar-actie die
  // niet vaak voorkomt. Bij een bredere "delete-actions"-design-pas
  // kunnen we 'm later harmoniseren.
  async function handleDisconnect() {
    const ok = window.confirm(
      "Weet je het zeker? Filly verliest toegang tot je profielinfo. Reviews die je al hebt blijven bewaard.",
    );
    if (!ok) return;
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectGoogleProfile();
      setMine({ connected: false, data: null, syncedAt: null });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ontkoppelen niet gelukt.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshGoogleProfile();
      setMine({
        connected: true,
        data: result.data,
        syncedAt: result.syncedAt,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vernieuwen niet gelukt.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const isConnected = mine?.connected ?? false;
  const profile = mine?.data;

  // Pre-fill voor de connect-modal: als Filly al info heeft over deze
  // zaak (uit het restaurant-profiel), gebruiken we die voor de eerste
  // zoekopdracht. Bespaart de eigenaar typewerk in 80% van de gevallen.
  const initialSearchQuery = active?.name
    ? `${active.name}`.trim()
    : "";

  return (
    <>
      <PageHeader
        title="Google Business Profile"
        subtitle="Beheer je profiel, reviews en zichtbaarheid in Google — Filly helpt mee."
      />

      {/* Status-banner — drie states. Loading toont neutrale skelet,
          de andere twee zijn vol-gekleurd om de huidige situatie
          herkenbaar te maken. */}
      {loading ? (
        <div
          style={{
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
            backgroundColor: "var(--color-surface-muted, #F4F4F5)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border, #E4E4E7)",
            color: "var(--text-secondary, #52525B)",
            fontSize: 13,
          }}
        >
          Status laden…
        </div>
      ) : isConnected && profile ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
            backgroundColor: "#F0F7F2",
            border: "1px solid #1F4A2D40",
            borderRadius: "var(--radius-md)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
            ✓
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 4,
                color: "#1F4A2D",
              }}
            >
              Gekoppeld met Google Business Profile
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.5,
              }}
            >
              <strong>{profile.displayName}</strong> — {profile.formattedAddress}
              {profile.rating !== null && (
                <>
                  <br />⭐ {profile.rating.toFixed(1)}
                  {profile.userRatingCount !== null &&
                    ` (${profile.userRatingCount.toLocaleString("nl-NL")} reviews)`}
                </>
              )}
              {mine?.syncedAt && (
                <>
                  <br />
                  <span style={{ fontSize: 12 }}>
                    Laatst bijgewerkt:{" "}
                    {new Date(mine.syncedAt).toLocaleString("nl-NL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0, flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || disconnecting}
            >
              {refreshing ? "Vernieuwen…" : "Vernieuw"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisconnect}
              disabled={refreshing || disconnecting}
            >
              {disconnecting ? "Ontkoppelen…" : "Ontkoppel"}
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
            backgroundColor: "var(--color-brand-soft, #F3F4F6)",
            border: "1px solid var(--color-border, #E4E4E7)",
            borderRadius: "var(--radius-md)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
            🔵
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 4,
                color: "var(--text, #18181B)",
              }}
            >
              Niet gekoppeld met Google Business Profile
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                lineHeight: 1.5,
              }}
            >
              Koppel je profiel om profiel-audit, concurrent-benchmark en
              Filly-posts te activeren. Reviews werken al op handmatig
              ingevoerde data.
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              Koppel met Google
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 13,
            color: "#B00020",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}
        >
          {error}
        </div>
      )}

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
            (f.status === "live-when-connected" && isConnected && f.href);
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <div style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
                    {f.icon}
                  </div>
                  {statusBadge(f.status, f.phaseLabel, isConnected)}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    marginBottom: "var(--space-2)",
                    color: "var(--text, #18181B)",
                  }}
                >
                  {f.title}
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

      <GoogleConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={handleConnected}
        initialQuery={initialSearchQuery}
      />
    </>
  );
}
