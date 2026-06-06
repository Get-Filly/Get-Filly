"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { useRestaurant } from "@/lib/restaurant-context";

// ============================================================
// AccountConnections, compacte koppelingen-tab
// ============================================================
// Verhuisd uit /dashboard/koppelingen (sidebar-link weg per
// 2026-05-12). Per 2026-05-12 (v2): compact list-stijl zonder
// uitleg-tekst per integratie. Eigenaar plakt API-key (of klikt
// OAuth-connect) en is klaar.
//
// Twee modi:
//   - apikey : default — eigenaar klikt 'Verbind', rij vouwt open
//              met een input-veld voor de API-key/token + Opslaan-knop.
//   - auto   : geen actie nodig (bv. weer-integratie via locatie).
//
// API-key-storage is voorlopig UI-only. De daadwerkelijke
// credential-tabel + encrypt-at-rest komt in volgende sessie
// (mig 0039 + encryption-helper).

type IntegrationCategory =
  | "reserveringen"
  | "vindbaarheid"
  | "communicatie"
  | "reviews"
  | "data";

type ConnectionMethod = "apikey" | "auto" | "oauth";

type Integration = {
  key: string;
  icon: string;
  name: string;
  method: ConnectionMethod;
  category: IntegrationCategory;
  // Placeholder voor het API-key-veld. Helpt eigenaar herkennen
  // waar de key vandaan komt.
  keyPlaceholder?: string;
  // Of de integratie momenteel actief is. Komt later uit DB,
  // voorlopig hardcoded.
  connected?: boolean;
  // Voor method "oauth": pad waar de "Verbind"-knop heen navigeert.
  // Dit is een server-route die de OAuth-flow start en doorstuurt
  // naar de provider (bv. Meta). Géén API-key plakken dus — één klik.
  connectPath?: string;
};

const integrations: Integration[] = [
  {
    key: "zenchef",
    icon: "🍽️",
    name: "Zenchef",
    method: "apikey",
    category: "reserveringen",
    keyPlaceholder: "Zenchef API-token",
  },
  {
    key: "opentable",
    icon: "🍽️",
    name: "OpenTable",
    method: "apikey",
    category: "reserveringen",
    keyPlaceholder: "OpenTable API-token",
  },
  {
    key: "sevenrooms",
    icon: "🍽️",
    name: "SevenRooms",
    method: "apikey",
    category: "reserveringen",
    keyPlaceholder: "SevenRooms API-token",
  },
  {
    key: "resengo",
    icon: "🍽️",
    name: "Resengo",
    method: "apikey",
    category: "reserveringen",
    keyPlaceholder: "Resengo API-token",
  },
  {
    key: "google_business",
    icon: "📍",
    name: "Google Business Profile",
    method: "apikey",
    category: "vindbaarheid",
    keyPlaceholder: "Google API-token",
  },
  {
    key: "resend",
    icon: "✉️",
    name: "Resend (mail)",
    method: "apikey",
    category: "communicatie",
    keyPlaceholder: "re_xxxxxxxxxxxxxxxxxx",
  },
  {
    key: "sendgrid",
    icon: "✉️",
    name: "SendGrid (mail)",
    method: "apikey",
    category: "communicatie",
    keyPlaceholder: "SG.xxxxxxxxxxxxxxxx",
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
    method: "apikey",
    category: "communicatie",
    keyPlaceholder: "TikTok access token",
  },
  {
    key: "whatsapp",
    icon: "💬",
    name: "WhatsApp Business",
    method: "apikey",
    category: "communicatie",
    keyPlaceholder: "WhatsApp Cloud API token",
  },
  {
    key: "tripadvisor",
    icon: "🧳",
    name: "TripAdvisor",
    method: "apikey",
    category: "reviews",
    keyPlaceholder: "TripAdvisor API-token",
  },
  {
    key: "thefork",
    icon: "🍴",
    name: "The Fork",
    method: "apikey",
    category: "reviews",
    keyPlaceholder: "The Fork API-token",
  },
  {
    key: "lightspeed",
    icon: "🧾",
    name: "Lightspeed / POS",
    method: "apikey",
    category: "data",
    keyPlaceholder: "POS API-token",
  },
  {
    key: "weather",
    icon: "🌤️",
    name: "Weer (Open-Meteo)",
    method: "auto",
    category: "data",
    connected: true,
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
  // Lokale state per integratie: ingevoerde API-key. Storage volgt
  // in volgende sessie (DB-tabel + encrypt). Voor nu: UI-only.
  const [keys, setKeys] = useState<Record<string, string>>({});
  // Welke integraties zijn uitgevouwen? Klik op 'Verbind' opent
  // het API-key-invul-veld onder de rij. Lokaal, geen persistence.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Actief restaurant: geven we mee aan de OAuth-start zodat de
  // koppeling straks (stap 3) aan de juiste zaak hangt.
  const { active } = useRestaurant();
  // De Meta-callback stuurt terug met ?meta=connected|denied|error
  // (+ ?reason=). We tonen daar een korte statusmelding voor.
  const searchParams = useSearchParams();
  const metaStatus = searchParams.get("meta");
  const metaReason = searchParams.get("reason");

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <MetaStatusBanner status={metaStatus} reason={metaReason} />
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
                  apiKey={keys[i.key] ?? ""}
                  onApiKeyChange={(v) =>
                    setKeys((prev) => ({ ...prev, [i.key]: v }))
                  }
                  isExpanded={expanded.has(i.key)}
                  onToggleExpand={() => toggleExpanded(i.key)}
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
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isLast: boolean;
  // Actief restaurant-id, meegegeven aan de OAuth-start-URL.
  activeRestaurantId: string | null;
};

function IntegrationRow({
  integration,
  apiKey,
  onApiKeyChange,
  isExpanded,
  onToggleExpand,
  isLast,
  activeRestaurantId,
}: IntegrationRowProps) {
  // Auto-integraties (weer): één enkele rij zonder expand. Geen knop,
  // geen input, alleen status-tekst.
  if (integration.method === "auto") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
        }}
      >
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
        <span
          style={{
            fontSize: 12,
            color: "var(--accent, #1F4A2D)",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          ✓ Actief via locatie
        </span>
      </div>
    );
  }

  // OAuth-integraties (Meta/Facebook + Instagram): geen API-key-veld,
  // maar één klik op 'Verbind' → volledige navigatie naar de
  // start-route die de OAuth-flow opent en naar de provider redirect.
  if (integration.method === "oauth") {
    const href = activeRestaurantId
      ? `${integration.connectPath}?restaurantId=${encodeURIComponent(activeRestaurantId)}`
      : (integration.connectPath ?? "#");
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
        }}
      >
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
          Verbind
        </a>
      </div>
    );
  }

  // API-key-integraties: collapsed by default, klik 'Verbind' → expand
  // met input-veld + Opslaan-knop. Klik nogmaals = collapse.
  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
      }}
    >
      {/* Hoofdrij: icon + naam + Verbind/Annuleer-knop */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
        }}
      >
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
        <button
          type="button"
          onClick={onToggleExpand}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid var(--border, #E5DFD0)",
            background: isExpanded
              ? "var(--bg-soft, #FAF7F1)"
              : "transparent",
            color: "var(--text, #18181B)",
            borderRadius: 6,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {isExpanded ? "Annuleer" : "Verbind"}
        </button>
      </div>

      {/* Expand-deel: API-key input + Opslaan-knop */}
      {isExpanded && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px 12px 46px",
          }}
        >
          <input
            type="password"
            placeholder={integration.keyPlaceholder ?? "API-key / token"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              padding: "6px 10px",
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 6,
              fontSize: 13,
              background: "var(--bg-soft, #FAF7F1)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
          <button
            type="button"
            disabled={!apiKey.trim()}
            onClick={() => {
              // TODO: save naar backend (DB-tabel volgt in volgende
              // sessie). Voor nu: alleen UI-feedback.
              alert(
                "Storage komt binnenkort. Voor nu kan je de key alleen invullen.",
              );
            }}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--border, #E5DFD0)",
              background: apiKey.trim()
                ? "var(--brand, #1F4A2D)"
                : "transparent",
              color: apiKey.trim() ? "#FFFFFF" : "var(--tl)",
              borderRadius: 6,
              cursor: apiKey.trim() ? "pointer" : "not-allowed",
              flexShrink: 0,
            }}
          >
            Opslaan
          </button>
        </div>
      )}
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
