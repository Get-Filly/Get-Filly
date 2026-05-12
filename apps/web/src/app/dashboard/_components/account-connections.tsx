"use client";

import { useState } from "react";

// ============================================================
// AccountConnections, compacte koppelingen-tab
// ============================================================
// Verhuisd uit /dashboard/koppelingen (sidebar-link weg per
// 2026-05-12). Per 2026-05-12 (v2): compact list-stijl zonder
// uitleg-tekst per integratie. Eigenaar plakt API-key (of klikt
// OAuth-connect) en is klaar.
//
// Twee soorten koppelingen:
//   - apikey  : eigenaar plakt z'n eigen API-key/token
//   - oauth   : "Verbind"-knop opent OAuth-flow (volgende stap)
//   - auto    : geen actie nodig (bv. weer-integratie via locatie)
//
// API-key-storage is voorlopig UI-only. De daadwerkelijke
// credential-tabel + encrypt-at-rest komt in volgende sessie
// (mig 0039 + encryption-helper). Voor nu kan eigenaar 'm intypen
// en zien dat het werkt visueel.

type IntegrationCategory =
  | "reserveringen"
  | "vindbaarheid"
  | "communicatie"
  | "reviews"
  | "data";

type ConnectionMethod = "apikey" | "oauth" | "auto";

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
};

const integrations: Integration[] = [
  {
    key: "zenchef",
    icon: "🍽️",
    name: "Zenchef",
    method: "oauth",
    category: "reserveringen",
  },
  {
    key: "opentable",
    icon: "🍽️",
    name: "OpenTable",
    method: "oauth",
    category: "reserveringen",
  },
  {
    key: "sevenrooms",
    icon: "🍽️",
    name: "SevenRooms",
    method: "oauth",
    category: "reserveringen",
  },
  {
    key: "resengo",
    icon: "🍽️",
    name: "Resengo",
    method: "oauth",
    category: "reserveringen",
  },
  {
    key: "google_business",
    icon: "📍",
    name: "Google Business Profile",
    method: "oauth",
    category: "vindbaarheid",
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
    key: "instagram",
    icon: "📱",
    name: "Instagram",
    method: "oauth",
    category: "communicatie",
  },
  {
    key: "facebook",
    icon: "👥",
    name: "Facebook",
    method: "oauth",
    category: "communicatie",
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
    method: "oauth",
    category: "reviews",
  },
  {
    key: "thefork",
    icon: "🍴",
    name: "The Fork",
    method: "oauth",
    category: "reviews",
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
  // Welke OAuth-integraties heeft de eigenaar aangeklikt? UI-only,
  // toont aan eigenaar dat 'ie deze wil gebruiken — echte OAuth-flow
  // komt in latere stap. Reset bij refresh.
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const toggleRequested = (key: string) => {
    setRequested((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
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
                  isRequested={requested.has(i.key)}
                  onRequest={() => toggleRequested(i.key)}
                  isLast={idx === group.length - 1}
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
  isRequested: boolean;
  onRequest: () => void;
  isLast: boolean;
};

function IntegrationRow({
  integration,
  apiKey,
  onApiKeyChange,
  isRequested,
  onRequest,
  isLast,
}: IntegrationRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--border, #E5DFD0)",
        background: isRequested
          ? "var(--brand-soft, #eef3ee)"
          : "transparent",
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
          flexShrink: 0,
          minWidth: 200,
        }}
      >
        {integration.name}
      </div>

      {/* Actie-deel: per methode iets anders. */}
      {integration.method === "apikey" && (
        <>
          <input
            type="password"
            placeholder={integration.keyPlaceholder ?? "API-key"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
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
              // sessie). Voor nu: toon "Opgeslagen"-feedback in een
              // toast of inline-state.
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
        </>
      )}

      {integration.method === "oauth" && (
        <>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onRequest}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              border: isRequested
                ? "1px solid var(--accent, #1F4A2D)"
                : "1px solid var(--border, #E5DFD0)",
              background: isRequested
                ? "var(--accent, #1F4A2D)"
                : "transparent",
              color: isRequested ? "#FFFFFF" : "var(--text, #18181B)",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
            }}
            title={
              isRequested
                ? "Klik nogmaals om te annuleren"
                : "Selecteer als je deze koppeling wilt gebruiken"
            }
          >
            {isRequested ? "✓ Geselecteerd" : "Verbind"}
          </button>
        </>
      )}

      {integration.method === "auto" && (
        <>
          <div style={{ flex: 1 }} />
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
        </>
      )}
    </div>
  );
}
