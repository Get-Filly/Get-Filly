"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { googleBusinessStatus } from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

// Feature-flag: live "Verbind"-knop voor de Google-OAuth-flow. Staat
// standaard uit zodat eigenaars geen knop zien zolang Google-API-toegang
// + app-verificatie nog niet rond zijn. Zet 'm aan (env = "true") zodra
// de Google-kant live is.
const GOOGLE_OAUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

// ============================================================
// AccountConnections, compacte koppelingen-tab
// ============================================================
// Verhuisd uit /dashboard/koppelingen (sidebar-link weg per
// 2026-05-12). Per 2026-06-11 (v3): eerlijke statussen — geen
// nep-"Verbind"-knoppen meer voor integraties zonder werkende
// backend-flow. (De oude API-key-invul-UI eindigde in een alert
// "Storage komt binnenkort"; dat wekte de indruk dat koppelen al
// kon. Zie git-history voor die variant.)
//
// Drie modi:
//   - oauth : werkende flow. Eén klik op 'Verbind' start de
//             OAuth-redirect (Meta), of 'Beheer' linkt naar de
//             pagina waar de echte koppel-flow leeft (Google).
//   - auto  : geen actie nodig (weer via locatie; mail via het
//             Get-Filly-platform).
//   - soon  : nog geen werkende flow — toont rustig 'Binnenkort'.
//             Zodra een integratie echt landt, krijgt de rij hier
//             z'n eigen flow (credential-opslag bestaat al:
//             integration_credentials, mig 0052).

type IntegrationCategory =
  | "reserveringen"
  | "vindbaarheid"
  | "communicatie"
  | "reviews"
  | "data";

type ConnectionMethod = "auto" | "oauth" | "soon";

type Integration = {
  key: string;
  icon: string;
  name: string;
  method: ConnectionMethod;
  category: IntegrationCategory;
  // Of de integratie momenteel actief is. Komt later uit DB,
  // voorlopig hardcoded.
  connected?: boolean;
  // Voor method "auto": status-tekst rechts in de rij.
  statusText?: string;
  // Voor method "oauth": waar de knop heen navigeert. Een
  // /oauth/...-route start de provider-flow (Meta); een gewone
  // dashboard-route (Google) linkt naar de pagina met de echte
  // koppel-flow.
  connectPath?: string;
  // Knop-label voor "oauth"-rijen. Default "Verbind".
  ctaLabel?: string;
  // Status-gestuurde rij (Google): de IntegrationRow haalt de OAuth-
  // koppelingsstatus op en kiest Verbind (niet gekoppeld) vs de
  // connectPath/ctaLabel (gekoppeld, nog ladend, of flag uit).
  statusDriven?: boolean;
};

const integrations: Integration[] = [
  {
    key: "zenchef",
    icon: "🍽️",
    name: "Zenchef",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "opentable",
    icon: "🍽️",
    name: "OpenTable",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "sevenrooms",
    icon: "🍽️",
    name: "SevenRooms",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "resengo",
    icon: "🍽️",
    name: "Resengo",
    method: "soon",
    category: "reserveringen",
  },
  {
    // Eén Google-rij, status-gestuurd (zie IntegrationRow):
    //   - niet verbonden (OAuth) -> "Verbind" start de business.manage-flow
    //   - wel verbonden / flag uit -> "Beheer" -> Vindbaarheid-hub (Places-
    //     audit, read-only, draait op de API-key, los van de OAuth-tokens)
    // De Verbind-tak staat achter NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED, zodat
    // we geen knop tonen zolang de Google-API-toegang nog niet rond is.
    key: "google_business",
    icon: "📍",
    name: "Google Bedrijfsprofiel",
    method: "oauth",
    category: "vindbaarheid",
    statusDriven: true,
    connectPath: "/dashboard/google-business",
    ctaLabel: "Beheer",
  },
  {
    // Campagne-mail loopt via het Get-Filly-platform (Resend in de
    // backend); de eigenaar hoeft hier zelf niets te koppelen.
    key: "mail",
    icon: "✉️",
    name: "E-mail (campagnes)",
    method: "auto",
    category: "communicatie",
    connected: true,
    statusText: "✓ Actief via Get-Filly",
  },
  {
    // Instagram-publiceren loopt via dezelfde Meta-OAuth als Facebook
    // (IG-account gekoppeld aan een FB-pagina). Eén klik op Verbind
    // start de flow; de scope-keuze gebeurt in de Meta-dialog.
    key: "instagram",
    icon: "📱",
    name: "Instagram",
    method: "oauth",
    category: "communicatie",
    connectPath: "/oauth/meta/start",
  },
  {
    key: "facebook",
    icon: "👥",
    name: "Facebook",
    method: "oauth",
    category: "communicatie",
    connectPath: "/oauth/meta/start",
  },
  {
    key: "tiktok",
    icon: "🎵",
    name: "TikTok for Business",
    method: "soon",
    category: "communicatie",
  },
  {
    key: "whatsapp",
    icon: "💬",
    name: "WhatsApp Business",
    method: "soon",
    category: "communicatie",
  },
  {
    key: "tripadvisor",
    icon: "🧳",
    name: "TripAdvisor",
    method: "soon",
    category: "reviews",
  },
  {
    key: "thefork",
    icon: "🍴",
    name: "The Fork",
    method: "soon",
    category: "reviews",
  },
  {
    key: "lightspeed",
    icon: "🧾",
    name: "Lightspeed / POS",
    method: "soon",
    category: "data",
  },
  {
    key: "weather",
    icon: "🌤️",
    name: "Weer (Open-Meteo)",
    method: "auto",
    category: "data",
    connected: true,
    statusText: "✓ Actief via locatie",
  },
];

const categoryLabels: Record<IntegrationCategory, string> = {
  reserveringen: "Reserveringen",
  vindbaarheid: "Vindbaarheid",
  communicatie: "Communicatie",
  reviews: "Reviews",
  data: "Externe data",
};

const categoryOrder: IntegrationCategory[] = [
  "reserveringen",
  "vindbaarheid",
  "communicatie",
  "reviews",
  "data",
];

export function ConnectionsSection() {
  // Actief restaurant: geven we mee aan de OAuth-start zodat de
  // koppeling aan de juiste zaak hangt.
  const { active } = useRestaurant();
  // De Meta-callback stuurt terug met ?meta=connected|denied|error
  // (+ ?reason=). We tonen daar een korte statusmelding voor.
  const searchParams = useSearchParams();
  const metaStatus = searchParams.get("meta");
  const metaReason = searchParams.get("reason");
  // De Google-callback gebruikt ?google=connected|denied|error (+ ?reason=).
  const googleStatus = searchParams.get("google");
  const googleReason = searchParams.get("reason");

  return (
    <div>
      <MetaStatusBanner status={metaStatus} reason={metaReason} />
      <GoogleStatusBanner status={googleStatus} reason={googleReason} />
      {categoryOrder.map((cat) => {
        const group = integrations.filter((i) => i.category === cat);
        if (group.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: "var(--space-5)" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--tl)",
                letterSpacing: 0.5,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              {categoryLabels[cat]}
            </div>
            <div
              style={{
                background: "var(--white, #FFFFFF)",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {group.map((i, idx) => (
                <IntegrationRow
                  key={i.key}
                  integration={i}
                  isLast={idx === group.length - 1}
                  activeRestaurantId={active?.id ?? null}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type IntegrationRowProps = {
  integration: Integration;
  isLast: boolean;
  // Actief restaurant-id, meegegeven aan de OAuth-start-URL.
  activeRestaurantId: string | null;
};

function IntegrationRow({
  integration,
  isLast,
  activeRestaurantId,
}: IntegrationRowProps) {
  // Status-gestuurde rij (Google): haal de OAuth-koppelingsstatus op zodat
  // we Verbind (nog niet gekoppeld) vs Beheer (wel) kunnen tonen. Alleen
  // achter de feature-flag; staat die uit -> statische rij, geen call.
  const statusDriven = !!integration.statusDriven && GOOGLE_OAUTH_ENABLED;
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!statusDriven || !activeRestaurantId) return;
    let cancelled = false;
    googleBusinessStatus()
      .then((s) => {
        if (!cancelled) setConnected(s.connected);
      })
      .catch(() => {
        // Niet-kritiek: bij een fout tonen we gewoon de default (Beheer).
        if (!cancelled) setConnected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [statusDriven, activeRestaurantId]);

  // Gedeelde rij-opbouw: icon + naam links, status/actie rechts.
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
  } as const;
  const nameStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text, #18181B)",
    flex: 1,
  } as const;

  // Auto-integraties (weer, mail): geen actie nodig, alleen status.
  if (integration.method === "auto") {
    return (
      <div style={rowStyle}>
        <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
          {integration.icon}
        </div>
        <div style={nameStyle}>{integration.name}</div>
        <span
          style={{
            fontSize: 12,
            color: "var(--accent, #1F4A2D)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {integration.statusText ?? "✓ Actief"}
        </span>
      </div>
    );
  }

  // OAuth-integraties: één klik → volledige navigatie. Het
  // restaurant-id gaat alleen mee naar échte OAuth-start-routes;
  // interne dashboard-links (Google → Vindbaarheid-hub) hebben
  // 'm niet nodig.
  if (integration.method === "oauth") {
    // Status-gestuurd: alleen als 'ie expliciet niet verbonden is sturen
    // we naar de OAuth-start. Anders (verbonden, nog ladend, of flag uit)
    // -> de default connectPath/ctaLabel.
    const useConnect = statusDriven && connected === false;
    const base = useConnect
      ? "/oauth/google/start"
      : (integration.connectPath ?? "#");
    const label = useConnect ? "Verbind" : (integration.ctaLabel ?? "Verbind");
    const href =
      base.startsWith("/oauth/") && activeRestaurantId
        ? `${base}?restaurantId=${encodeURIComponent(activeRestaurantId)}`
        : base;
    return (
      <div style={rowStyle}>
        <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
          {integration.icon}
        </div>
        <div style={nameStyle}>{integration.name}</div>
        {/* Plain <a> (geen <Link>): een full navigation naar de
            server-route-handler, die server-side naar Meta 302't.
            <Link> zou client-side proberen te routen en de redirect
            breken. */}
        <a
          href={href}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid var(--border, #E5DFD0)",
            background: "transparent",
            color: "var(--text, #18181B)",
            borderRadius: 6,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {label}
        </a>
      </div>
    );
  }

  // Soon-integraties: nog geen werkende flow. Rustige "Binnenkort"-
  // pill i.p.v. een knop die nergens heen leidt — eerlijk naar de
  // eigenaar toe.
  return (
    <div style={rowStyle}>
      <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
        {integration.icon}
      </div>
      <div style={nameStyle}>{integration.name}</div>
      <span
        style={{
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--tl)",
          background: "var(--bg-soft, #FAF7F1)",
          border: "1px solid var(--border, #E5DFD0)",
          borderRadius: 999,
          flexShrink: 0,
        }}
      >
        Binnenkort
      </span>
    </div>
  );
}

// ============================================================
// MetaStatusBanner, feedback na de OAuth-redirect
// ============================================================
// De /oauth/meta/callback-route stuurt terug naar
// /dashboard/account?tab=koppelingen&meta=<status>. Hier vertalen
// we die status naar een korte melding. Toont niets als er geen
// ?meta= in de URL staat (de normale staat).
function MetaStatusBanner({
  status,
  reason,
}: {
  status: string | null;
  reason: string | null;
}) {
  if (!status) return null;

  // Per status: kleur + tekst. We houden het bewust kort; de
  // technische `reason` tonen we alleen bij een fout.
  const variants: Record<
    string,
    { bg: string; border: string; color: string; text: string }
  > = {
    connected: {
      bg: "#ECF6EF",
      border: "#1F4A2D",
      color: "#1F4A2D",
      text: "✓ Meta-koppeling geslaagd — je gaf toestemming via Facebook/Instagram.",
    },
    denied: {
      bg: "#FAF7F1",
      border: "#E5DFD0",
      color: "#18181B",
      text: "Koppeling geannuleerd. Je kunt het opnieuw proberen via Verbind.",
    },
    error: {
      bg: "#FBECEC",
      border: "#B42318",
      color: "#B42318",
      text: `Er ging iets mis bij de koppeling${reason ? ` (${reason})` : ""}. Probeer het opnieuw.`,
    },
  };

  const v = variants[status] ?? variants.error;

  return (
    <div
      role="status"
      style={{
        marginBottom: "var(--space-5)",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 500,
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        borderRadius: 8,
      }}
    >
      {v.text}
    </div>
  );
}

// ============================================================
// GoogleStatusBanner, feedback na de Google-OAuth-redirect
// ============================================================
// De /oauth/google/callback-route stuurt terug naar
// /dashboard/account?tab=koppelingen&google=<status>(&reason=<reason>).
// We vertalen de status + de belangrijkste reasons naar nette NL-tekst.
// Toont niets zonder ?google= in de URL.
function GoogleStatusBanner({
  status,
  reason,
}: {
  status: string | null;
  reason: string | null;
}) {
  if (!status) return null;

  // Per fout-reason een begrijpelijke, actiegerichte melding.
  const reasonText: Record<string, string> = {
    no_refresh:
      "Google gaf geen langdurige toegang. Trek de toegang in op myaccount.google.com/permissions en verbind opnieuw.",
    refresh_revoked:
      "De Google-toegang is ingetrokken of verlopen. Verbind opnieuw.",
    redirect_uri_mismatch:
      "De redirect-URL klopt niet met Google Cloud Console. Neem contact op met support.",
    state:
      "De beveiligingscontrole faalde of verliep. Start de koppeling opnieuw.",
    access: "Je hebt geen toegang tot dit restaurant.",
    config: "De Google-configuratie ontbreekt. Neem contact op met support.",
    no_restaurant: "Geen restaurant geselecteerd. Kies eerst een zaak.",
  };

  const variants: Record<
    string,
    { bg: string; border: string; color: string; text: string }
  > = {
    connected: {
      bg: "#ECF6EF",
      border: "#1F4A2D",
      color: "#1F4A2D",
      text: "✓ Google-koppeling geslaagd — Filly mag nu namens je zaak handelen.",
    },
    denied: {
      bg: "#FAF7F1",
      border: "#E5DFD0",
      color: "#18181B",
      text: "Koppeling geannuleerd. Je kunt het opnieuw proberen via Verbind.",
    },
    error: {
      bg: "#FBECEC",
      border: "#B42318",
      color: "#B42318",
      text:
        (reason && reasonText[reason]) ??
        `Er ging iets mis bij de koppeling${reason ? ` (${reason})` : ""}. Probeer het opnieuw.`,
    },
  };

  const v = variants[status] ?? variants.error;

  return (
    <div
      role="status"
      style={{
        marginBottom: "var(--space-5)",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 500,
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        borderRadius: 8,
      }}
    >
      {v.text}
    </div>
  );
}
