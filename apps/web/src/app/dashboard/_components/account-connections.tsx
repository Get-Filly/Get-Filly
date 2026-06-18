"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  metaStatus,
  metaDisconnect,
  googleBusinessStatus,
  googleBusinessDisconnect,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

// Feature-flag: live Google-OAuth-flow. Staat standaard uit zodat
// eigenaars geen "Verbind" zien zolang de Google-API-toegang +
// verificatie nog niet rond zijn. Flag UIT -> de Google-rij toont alleen
// "Beheer" (de vindbaarheid-hub draait op de Places-API-key, los van
// OAuth). Flag AAN -> Verbind / ✓ Verbonden op basis van de live status.
const GOOGLE_OAUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

// ============================================================
// AccountConnections, koppelingen-tab
// ============================================================
// Eén bron van waarheid per provider: de sectie haalt de live
// koppelingsstatus 1× op (Meta + Google) en geeft 'm door aan de rijen.
// Zo tonen rijen de échte staat:
//   - oauth, niet verbonden  -> "Verbind" (start de OAuth-redirect)
//   - oauth, verbonden       -> "✓ Verbonden" + (optioneel) Beheer + Ontkoppel
//   - auto                   -> vaste status-tekst (weer/mail via platform)
//   - soon                   -> rustige "Binnenkort"-pill
//
// Facebook + Instagram zijn één rij ("Facebook & Instagram"): het is één
// Meta-koppeling (zakelijk Instagram-publiceren loopt via een FB-pagina),
// dus één Verbind die de Meta-OAuth start. Na koppelen kies je in het
// MetaPublishPanel de pagina + het gekoppelde IG-account. De losse, oudere
// /dashboard/koppelingen-pagina is vervangen door een redirect hierheen.

type IntegrationCategory =
  | "reserveringen"
  | "vindbaarheid"
  | "communicatie"
  | "reviews"
  | "data";

type ConnectionMethod = "auto" | "oauth" | "soon";

// Provider waarvan we de live koppelingsstatus ophalen. Meerdere rijen
// kunnen dezelfde provider delen (Facebook + Instagram = Meta).
type Provider = "meta" | "google_business";

type Integration = {
  key: string;
  icon: string;
  name: string;
  method: ConnectionMethod;
  category: IntegrationCategory;
  // method "auto": status-tekst rechts in de rij.
  statusText?: string;
  // method "oauth": welke provider-status deze rij volgt.
  provider?: Provider;
  // method "oauth": waar "Verbind" heen navigeert (OAuth-start-route).
  connectPath?: string;
  // method "oauth": waar "Beheer" heen gaat als de koppeling actief is
  // (bv. de Google-vindbaarheid-hub). Meta heeft geen aparte hub.
  managePath?: string;
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
    // Eén Google-rij. Verbonden? -> "✓ Verbonden" + Beheer (hub) + Ontkoppel.
    // Niet verbonden + flag aan -> "Verbind" (business.manage-OAuth).
    // Flag uit -> alleen "Beheer" -> vindbaarheid-hub (Places-audit op
    // de API-key, los van de OAuth-tokens).
    key: "google_business",
    icon: "📍",
    name: "Google Bedrijfsprofiel",
    method: "oauth",
    category: "vindbaarheid",
    provider: "google_business",
    connectPath: "/oauth/google/start",
    managePath: "/dashboard/google-business/profiel",
  },
  {
    // Campagne-mail loopt via het Get-Filly-platform (Resend in de
    // backend); de eigenaar hoeft hier zelf niets te koppelen.
    key: "mail",
    icon: "✉️",
    name: "E-mail (campagnes)",
    method: "auto",
    category: "communicatie",
    statusText: "✓ Actief via Get-Filly",
  },
  {
    // Eén rij voor Facebook + Instagram: het is één Meta-koppeling (IG
    // hangt aan een FB-pagina). Eén "Verbind" start de Meta-OAuth; de
    // pagina- + IG-keuze gebeurt daarna in het MetaPublishPanel.
    key: "meta",
    icon: "👥",
    name: "Facebook & Instagram",
    method: "oauth",
    category: "communicatie",
    provider: "meta",
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

// ---- Gedeelde rij-stijlen (1 plek i.p.v. per branch herhaald) ----
const actionLinkStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border, #E5DFD0)",
  background: "transparent",
  color: "var(--text, #18181B)",
  borderRadius: 6,
  textDecoration: "none",
  flexShrink: 0,
};
const connectedPillStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--accent, #1F4A2D)",
  background: "#ECF6EF",
  border: "1px solid #CFE6D7",
  borderRadius: 999,
  padding: "4px 10px",
  flexShrink: 0,
};
const disconnectButtonStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--tl)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "4px 4px",
  textDecoration: "underline",
  flexShrink: 0,
};
const soonPillStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--tl)",
  background: "var(--bg-soft, #FAF7F1)",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: 999,
  flexShrink: 0,
};
const autoStatusStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--accent, #1F4A2D)",
  fontWeight: 500,
  flexShrink: 0,
};

export function ConnectionsSection() {
  const { active } = useRestaurant();
  const searchParams = useSearchParams();
  // Callbacks keren terug met ?meta=... of ?google=... (+ ?reason=).
  // Er is er altijd hooguit één tegelijk; we geven `reason` daarom alleen
  // door aan de banner waarvan de status-param ook echt aanwezig is.
  const metaStatusParam = searchParams.get("meta");
  const googleStatusParam = searchParams.get("google");
  const reason = searchParams.get("reason");

  // Live koppelingsstatus per provider. null = nog ladend / onbekend.
  const [status, setStatus] = useState<Record<Provider, boolean | null>>({
    meta: null,
    google_business: null,
  });

  // Status 1× ophalen (en opnieuw bij wissel van actief restaurant).
  const refresh = useCallback(() => {
    if (!active?.id) return;
    metaStatus()
      .then((s) => setStatus((p) => ({ ...p, meta: s.connected })))
      .catch(() => setStatus((p) => ({ ...p, meta: false })));
    // Google-status altijd bevragen: ook met de flag uit willen we een
    // bestaande koppeling kunnen tonen + ontkoppelen. De "Verbind"-knop
    // blijft wél flag-gated (zie OAuthAction).
    googleBusinessStatus()
      .then((s) => setStatus((p) => ({ ...p, google_business: s.connected })))
      .catch(() => setStatus((p) => ({ ...p, google_business: false })));
  }, [active?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDisconnect = useCallback(async (provider: Provider) => {
    const ok = window.confirm(
      "Koppeling intrekken? Filly kan dan niet meer namens je zaak posten of handelen tot je opnieuw verbindt.",
    );
    if (!ok) return;
    try {
      if (provider === "meta") await metaDisconnect();
      else await googleBusinessDisconnect();
      // Direct optimistisch bijwerken zodat de rij meteen "Verbind" toont.
      setStatus((p) => ({ ...p, [provider]: false }));
    } catch {
      // Stil: bij een fout blijft de status staan; gebruiker kan opnieuw proberen.
    }
  }, []);

  return (
    <div>
      <MetaStatusBanner
        status={metaStatusParam}
        reason={metaStatusParam ? reason : null}
      />
      <GoogleStatusBanner
        status={googleStatusParam}
        reason={googleStatusParam ? reason : null}
      />
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
                  connected={i.provider ? status[i.provider] : null}
                  onDisconnect={handleDisconnect}
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
  activeRestaurantId: string | null;
  // Live status van de bijbehorende provider (null = ladend / n.v.t.).
  connected: boolean | null;
  onDisconnect: (provider: Provider) => void;
};

function IntegrationRow({
  integration,
  isLast,
  activeRestaurantId,
  connected,
  onDisconnect,
}: IntegrationRowProps) {
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
  };

  // Rechter-blok (status/actie) per method bepalen; de rij-opbouw zelf
  // (icon + naam links) is voor alle types gelijk.
  let right: React.ReactNode;
  if (integration.method === "auto") {
    right = (
      <span style={autoStatusStyle}>{integration.statusText ?? "✓ Actief"}</span>
    );
  } else if (integration.method === "soon") {
    right = <span style={soonPillStyle}>Binnenkort</span>;
  } else {
    right = (
      <OAuthAction
        integration={integration}
        activeRestaurantId={activeRestaurantId}
        connected={connected}
        onDisconnect={onDisconnect}
      />
    );
  }

  return (
    <div style={rowStyle}>
      <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
        {integration.icon}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text, #18181B)",
          flex: 1,
        }}
      >
        {integration.name}
      </div>
      {right}
    </div>
  );
}

// Rechter-blok voor OAuth-rijen: Verbind / ✓ Verbonden / Beheer / Ontkoppel
// op basis van de live status + de feature-flag.
function OAuthAction({
  integration,
  activeRestaurantId,
  connected,
  onDisconnect,
}: {
  integration: Integration;
  activeRestaurantId: string | null;
  connected: boolean | null;
  onDisconnect: (provider: Provider) => void;
}) {
  const provider = integration.provider;
  const flagOff = provider === "google_business" && !GOOGLE_OAUTH_ENABLED;

  // Restaurant-id alleen meegeven aan échte OAuth-start-routes; interne
  // dashboard-links (Beheer → hub) hebben 'm niet nodig.
  const withRid = (path: string) =>
    path.startsWith("/oauth/") && activeRestaurantId
      ? `${path}?restaurantId=${encodeURIComponent(activeRestaurantId)}`
      : path;

  // Verbonden: groene pill + (optioneel) Beheer + Ontkoppel. Staat BEWUST
  // boven de flag-check, zodat een bestaande koppeling altijd ontkoppelbaar
  // is — ook als de "Verbind"-knop nog flag-gated verborgen is (net als FB/IG).
  if (connected === true && provider) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={connectedPillStyle}>✓ Verbonden</span>
        {integration.managePath && (
          <a href={integration.managePath} style={actionLinkStyle}>
            Beheer
          </a>
        )}
        <button
          type="button"
          onClick={() => onDisconnect(provider)}
          style={disconnectButtonStyle}
        >
          Ontkoppel
        </button>
      </div>
    );
  }

  // Google zonder flag + niet verbonden: alleen "Beheer" → profiel-scherm.
  // Geen "Verbind" tot de Google-kant live is (de hub/profiel draait op de
  // Places-API-key, los van de OAuth-tokens).
  if (flagOff) {
    return (
      <a href={integration.managePath ?? "#"} style={actionLinkStyle}>
        Beheer
      </a>
    );
  }

  // Status nog onbekend (ladend): muted placeholder i.p.v. een valse
  // "Verbind" die meteen weer naar "✓ Verbonden" zou springen.
  if (connected === null) {
    return (
      <span style={{ fontSize: 12, color: "var(--tl)", flexShrink: 0 }}>…</span>
    );
  }

  // Niet verbonden: "Verbind" → OAuth-start.
  // Plain <a> (geen <Link>): full navigation naar de server-route die
  // server-side naar de provider 302't; <Link> zou de redirect breken.
  return (
    <a href={withRid(integration.connectPath ?? "#")} style={actionLinkStyle}>
      Verbind
    </a>
  );
}

// ============================================================
// MetaStatusBanner, feedback na de Meta-OAuth-redirect
// ============================================================
// De /oauth/meta/callback-route stuurt terug naar
// /dashboard/account?tab=koppelingen&meta=<status>(&reason=). Toont
// niets zonder ?meta= in de URL.
function MetaStatusBanner({
  status,
  reason,
}: {
  status: string | null;
  reason: string | null;
}) {
  if (!status) return null;

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
// De /oauth/google/callback-route stuurt terug met
// &google=<status>(&reason=<reason>). Toont niets zonder ?google=.
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
