"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  metaStatus,
  metaDisconnect,
  googleBusinessStatus,
  googleBusinessDisconnect,
  tiktokStatus,
  tiktokDisconnect,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";
import { MetaPageSelector } from "./meta-publish-panel";

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
type Provider = "meta" | "google_business" | "tiktok";

type Integration = {
  key: string;
  icon: string;
  // i18n-key voor de zichtbare naam (zie messages-namespace).
  nameKey: string;
  method: ConnectionMethod;
  category: IntegrationCategory;
  // method "auto": i18n-key voor de status-tekst rechts in de rij.
  statusKey?: string;
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
    nameKey: "providers.zenchef",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "opentable",
    icon: "🍽️",
    nameKey: "providers.opentable",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "sevenrooms",
    icon: "🍽️",
    nameKey: "providers.sevenrooms",
    method: "soon",
    category: "reserveringen",
  },
  {
    key: "resengo",
    icon: "🍽️",
    nameKey: "providers.resengo",
    method: "soon",
    category: "reserveringen",
  },
  {
    // Eén Google-rij met volledige cyclus: niet verbonden -> "Verbind" +
    // "Beheer" (→ profiel-scherm); verbonden -> "✓ Verbonden" + Beheer +
    // Ontkoppel. Zo komt na ontkoppelen altijd weer een koppel-knop terug.
    key: "google_business",
    icon: "📍",
    nameKey: "providers.googleBusiness",
    method: "oauth",
    category: "vindbaarheid",
    provider: "google_business",
    connectPath: "/oauth/google/start",
    managePath: "/dashboard/google-business/profiel",
  },
  {
    // Campagne-mail loopt via het Get-Filly-platform (Resend in de backend);
    // er is geen account om te "ontkoppelen". Via "Beheer" kom je wél bij het
    // eigen verzend-domein (MailDomainSection), dat je kunt koppelen/ontkoppelen.
    key: "mail",
    icon: "✉️",
    nameKey: "providers.mail",
    method: "auto",
    category: "communicatie",
    statusKey: "status.activeViaGetFilly",
    managePath: "#mail-domein",
  },
  {
    // Eén rij voor Facebook + Instagram: het is één Meta-koppeling (IG
    // hangt aan een FB-pagina). Eén "Verbind" start de Meta-OAuth; de
    // pagina- + IG-keuze gebeurt daarna in het MetaPublishPanel.
    key: "meta",
    icon: "👥",
    nameKey: "providers.meta",
    method: "oauth",
    category: "communicatie",
    provider: "meta",
    connectPath: "/oauth/meta/start",
  },
  {
    key: "tiktok",
    icon: "🎵",
    nameKey: "providers.tiktok",
    method: "oauth",
    category: "communicatie",
    provider: "tiktok",
    connectPath: "/oauth/tiktok/start",
  },
  {
    key: "whatsapp",
    icon: "💬",
    nameKey: "providers.whatsapp",
    method: "soon",
    category: "communicatie",
  },
  {
    key: "tripadvisor",
    icon: "🧳",
    nameKey: "providers.tripadvisor",
    method: "soon",
    category: "reviews",
  },
  {
    key: "thefork",
    icon: "🍴",
    nameKey: "providers.thefork",
    method: "soon",
    category: "reviews",
  },
  {
    key: "lightspeed",
    icon: "🧾",
    nameKey: "providers.lightspeed",
    method: "soon",
    category: "data",
  },
  {
    key: "weather",
    icon: "🌤️",
    nameKey: "providers.weather",
    method: "auto",
    category: "data",
    statusKey: "status.activeViaLocation",
  },
];

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
  const t = useTranslations("dash__components_account_connections");
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
    tiktok: null,
  });

  // Status 1× ophalen (en opnieuw bij wissel van actief restaurant).
  const refresh = useCallback(() => {
    if (!active?.id) return;
    metaStatus()
      .then((s) => setStatus((p) => ({ ...p, meta: s.connected })))
      .catch(() => setStatus((p) => ({ ...p, meta: false })));
    // Google-status ophalen zodat de rij de echte staat toont (Verbind vs
    // Verbonden + Ontkoppel).
    googleBusinessStatus()
      .then((s) => setStatus((p) => ({ ...p, google_business: s.connected })))
      .catch(() => setStatus((p) => ({ ...p, google_business: false })));
    // TikTok-status (Verbind vs Verbonden + Ontkoppel).
    tiktokStatus()
      .then((s) => setStatus((p) => ({ ...p, tiktok: s.connected })))
      .catch(() => setStatus((p) => ({ ...p, tiktok: false })));
  }, [active?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDisconnect = useCallback(async (provider: Provider) => {
    const ok = window.confirm(t("disconnectConfirm"));
    if (!ok) return;
    try {
      if (provider === "meta") await metaDisconnect();
      else if (provider === "tiktok") await tiktokDisconnect();
      else await googleBusinessDisconnect();
      // Direct optimistisch bijwerken zodat de rij meteen "Verbind" toont.
      setStatus((p) => ({ ...p, [provider]: false }));
    } catch {
      // Stil: bij een fout blijft de status staan; gebruiker kan opnieuw proberen.
    }
  }, [t]);

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
              {t(`categories.${cat}`)}
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
                <Fragment key={i.key}>
                  <IntegrationRow
                    integration={i}
                    isLast={idx === group.length - 1}
                    activeRestaurantId={active?.id ?? null}
                    connected={i.provider ? status[i.provider] : null}
                    onDisconnect={handleDisconnect}
                  />
                  {/* Pagina-keuze klapt uit direct onder de Meta-rij; de
                      selector verbergt zich zelf als Meta niet verbonden is. */}
                  {i.key === "meta" && <MetaPageSelector />}
                </Fragment>
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
  const t = useTranslations("dash__components_account_connections");
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={autoStatusStyle}>
          {integration.statusKey ? t(integration.statusKey) : t("status.active")}
        </span>
        {integration.managePath && (
          <a href={integration.managePath} style={actionLinkStyle}>
            {t("manage")}
          </a>
        )}
      </div>
    );
  } else if (integration.method === "soon") {
    right = <span style={soonPillStyle}>{t("soon")}</span>;
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
        {t(integration.nameKey)}
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
  const t = useTranslations("dash__components_account_connections");
  const provider = integration.provider;

  // Restaurant-id alleen meegeven aan échte OAuth-start-routes; interne
  // dashboard-links (Beheer → hub) hebben 'm niet nodig.
  const withRid = (path: string) =>
    path.startsWith("/oauth/") && activeRestaurantId
      ? `${path}?restaurantId=${encodeURIComponent(activeRestaurantId)}`
      : path;

  // Verbonden: groene pill + (optioneel) Beheer + Ontkoppel (net als FB/IG).
  if (connected === true && provider) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={connectedPillStyle}>{t("connected")}</span>
        {integration.managePath && (
          <a href={integration.managePath} style={actionLinkStyle}>
            {t("manage")}
          </a>
        )}
        <button
          type="button"
          onClick={() => onDisconnect(provider)}
          style={disconnectButtonStyle}
        >
          {t("disconnect")}
        </button>
      </div>
    );
  }

  // Status nog onbekend (ladend): muted placeholder i.p.v. een valse
  // "Verbind" die meteen weer naar "✓ Verbonden" zou springen.
  if (connected === null) {
    return (
      <span style={{ fontSize: 12, color: "var(--tl)", flexShrink: 0 }}>…</span>
    );
  }

  // Niet verbonden: "Verbind" (+ "Beheer" als de rij een beheerpagina heeft,
  // bv. Google → profiel-scherm), zodat na ontkoppelen altijd weer een
  // koppel-knop verschijnt. Plain <a> (geen <Link>): full navigation naar de
  // server-route die server-side naar de provider 302't.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <a href={withRid(integration.connectPath ?? "#")} style={actionLinkStyle}>
        {t("connect")}
      </a>
      {integration.managePath && (
        <a href={integration.managePath} style={actionLinkStyle}>
          {t("manage")}
        </a>
      )}
    </div>
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
  const t = useTranslations("dash__components_account_connections");
  if (!status) return null;

  const variants: Record<
    string,
    { bg: string; border: string; color: string; text: string }
  > = {
    connected: {
      bg: "#ECF6EF",
      border: "#1F4A2D",
      color: "#1F4A2D",
      text: t("meta.connected"),
    },
    denied: {
      bg: "#FAF7F1",
      border: "#E5DFD0",
      color: "#18181B",
      text: t("denied"),
    },
    error: {
      bg: "#FBECEC",
      border: "#B42318",
      color: "#B42318",
      text: reason ? t("errorWithReason", { reason }) : t("error"),
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
  const t = useTranslations("dash__components_account_connections");
  if (!status) return null;

  // Per fout-reason een begrijpelijke, actiegerichte melding.
  const reasonKeys: Record<string, string> = {
    no_refresh: "google.reasons.noRefresh",
    refresh_revoked: "google.reasons.refreshRevoked",
    redirect_uri_mismatch: "google.reasons.redirectUriMismatch",
    state: "google.reasons.state",
    access: "google.reasons.access",
    config: "google.reasons.config",
    no_restaurant: "google.reasons.noRestaurant",
  };

  const reasonText = reason ? reasonKeys[reason] : undefined;

  const variants: Record<
    string,
    { bg: string; border: string; color: string; text: string }
  > = {
    connected: {
      bg: "#ECF6EF",
      border: "#1F4A2D",
      color: "#1F4A2D",
      text: t("google.connected"),
    },
    denied: {
      bg: "#FAF7F1",
      border: "#E5DFD0",
      color: "#18181B",
      text: t("denied"),
    },
    error: {
      bg: "#FBECEC",
      border: "#B42318",
      color: "#B42318",
      text: reasonText
        ? t(reasonText)
        : reason
          ? t("errorWithReason", { reason })
          : t("error"),
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
