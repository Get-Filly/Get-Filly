"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BundleChannel, CampaignBundleCard } from "@/lib/api";

// ============================================================
// FillyChatBundleCard, multi-channel-voorstel kaart in chat
// ============================================================
//
// Wordt onder Filly-berichten getoond wanneer message_card.kind ===
// 'campaign_bundle'. Toont:
//   - bundle-naam + thema
//   - een collapsible per kanaal dat in de bundel zit (sinds 2026-06-02
//     kan dat elke subset van de 5 kanalen zijn: mail / Instagram /
//     Facebook / WhatsApp / Google Business), default ingeklapt
//   - 1 actieknop "Maak N campagnes aan" of dismiss
//
// Na accept: per aangemaakt kanaal een link naar de campagne-detail-
// pagina. Eigenaar klikt door en pusht daar per kanaal.
//
// Status-states zijn parallel aan FillyChatProposalCard maar met een
// generieke campaignIds-map zodat we voor elk kanaal het campagne-id
// kunnen bewaren.
// ============================================================

export type BundleStatus =
  | { state: "pending" }
  | { state: "creating" }
  | {
      state: "created";
      // Map kanaal → aangemaakte campagne-id (alleen aangemaakte kanalen).
      campaignIds: Partial<Record<BundleChannel, string>>;
    }
  // Sinds 2026-05-04: bij chat-history-load detecteren we of de bundle
  // al eerder geaccepteerd is via de approved-suggesties. We weten dan
  // alleen het anker-campagne-id; de andere sub-campagnes staan via
  // group_id in de campagnes-lijst, daarom een generieke "Open campagnes".
  | {
      state: "approved_existing";
      anchorCampaignId: string;
    }
  | { state: "dismissed" }
  | { state: "error"; message: string };

// Volgorde + presentatie per kanaal. We renderen alleen de kanalen die
// daadwerkelijk in de bundel zitten.
const CHANNEL_META: { key: BundleChannel; icon: string; label: string }[] = [
  { key: "mail", icon: "✉️", label: "Mail" },
  { key: "instagram", icon: "📷", label: "Instagram" },
  { key: "facebook", icon: "📘", label: "Facebook" },
  { key: "whatsapp", icon: "💬", label: "WhatsApp" },
  { key: "google_business", icon: "📍", label: "Google Business" },
  { key: "tiktok", icon: "🎵", label: "TikTok" },
];

type Props = {
  bundle: CampaignBundleCard;
  status: BundleStatus;
  // Eigenaar selecteert welke kanalen 'ie daadwerkelijk wil aanmaken.
  // Default in de kaart = alle aanwezige kanalen.
  onAccept: (channels: BundleChannel[]) => void;
  onDismiss: () => void;
};

export function FillyChatBundleCard({
  bundle,
  status,
  onAccept,
  onDismiss,
}: Props) {
  const t = useTranslations("dash__components_filly_chat_bundle_card");

  // Welke kanalen zitten er daadwerkelijk in deze bundel? Alleen die
  // renderen we (en bieden we ter selectie aan).
  const presentChannels = CHANNEL_META.filter((m) => bundle.channels[m.key]);

  const [openChannel, setOpenChannel] = useState<BundleChannel | null>(null);

  // Default: alle aanwezige kanalen aangevinkt. Bij uitvinken zien we
  // direct dat dat kanaal niet aangemaakt zal worden.
  const [selected, setSelected] = useState<
    Partial<Record<BundleChannel, boolean>>
  >(() => Object.fromEntries(presentChannels.map((m) => [m.key, true])));

  if (status.state === "dismissed") return null;

  const toggle = (key: BundleChannel) => {
    setOpenChannel((cur) => (cur === key ? null : key));
  };

  const toggleSelected = (key: BundleChannel) => {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  };

  const selectedChannels: BundleChannel[] = presentChannels
    .map((m) => m.key)
    .filter((k) => selected[k]);
  const selectedCount = selectedChannels.length;

  // Rijen zijn alleen interactief zolang we nog kunnen aanmaken.
  const rowsDisabled = status.state !== "pending" && status.state !== "error";

  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        background: "var(--brand-soft, #EDF2EE)",
        border: "1px solid var(--brand, #1F4A2D)",
        borderRadius: 10,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            background: "var(--brand, #1F4A2D)",
            color: "white",
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {t("multiChannelBadge")}
        </span>
        <strong style={{ fontSize: 14 }}>{bundle.name}</strong>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "var(--brand, #1F4A2D)",
          fontStyle: "italic",
          lineHeight: 1.5,
        }}
      >
        {bundle.theme}
      </div>

      {/* Eén collapsible per aanwezig kanaal, met checkbox voor selectie.
          Default alle aangevinkt; eigenaar kan uitvinken om dat kanaal
          over te slaan. Kies-tekst alleen tonen bij pending. */}
      {status.state === "pending" && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--tl, #6B6F71)",
            marginBottom: 4,
          }}
        >
          {t("chooseChannels")}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {presentChannels.map((m) => (
          <ChannelRow
            key={m.key}
            icon={m.icon}
            title={m.label}
            open={openChannel === m.key}
            onToggle={() => toggle(m.key)}
            checked={!!selected[m.key]}
            onCheckChange={() => toggleSelected(m.key)}
            disabled={rowsDisabled}
          >
            {renderChannelContent(m.key, bundle, t)}
          </ChannelRow>
        ))}
      </div>

      {/* Acties, verschilt per status */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {status.state === "pending" && (
          <>
            <button
              type="button"
              onClick={() => onAccept(selectedChannels)}
              disabled={selectedCount === 0}
              title={
                selectedCount === 0 ? t("selectAtLeastOne") : undefined
              }
              style={{
                background:
                  selectedCount === 0
                    ? "var(--border, #e5e5e5)"
                    : "var(--brand, #1F4A2D)",
                color: selectedCount === 0 ? "var(--tl, #9CA3AF)" : "white",
                border: "none",
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              {selectedCount === 0
                ? t("selectChannelCta")
                : t("createCampaignsCta", { count: selectedCount })}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                background: "transparent",
                color: "var(--tl, #6B6F71)",
                border: "1px solid var(--border, #e5e5e5)",
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("notNow")}
            </button>
          </>
        )}
        {status.state === "creating" && (
          <div style={{ fontSize: 12, color: "var(--tl, #6B6F71)" }}>
            {t("creating")}
          </div>
        )}
        {status.state === "approved_existing" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <div style={{ color: "var(--brand, #1F4A2D)", fontWeight: 600 }}>
              {t("bundleAlreadyCreated")}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href={`/dashboard/campagnes/${status.anchorCampaignId}`}
                style={{ color: "var(--brand, #1F4A2D)" }}
              >
                {t("openCampaign")}
              </Link>
              <Link
                href="/dashboard/campagnes"
                style={{ color: "var(--brand, #1F4A2D)" }}
              >
                {t("allCampaigns")}
              </Link>
            </div>
          </div>
        )}
        {status.state === "created" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <div style={{ color: "var(--brand, #1F4A2D)", fontWeight: 600 }}>
              {t("draftCampaignsReady")}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {presentChannels
                .filter((m) => status.campaignIds[m.key])
                .map((m) => (
                  <Link
                    key={m.key}
                    href={`/dashboard/campagnes/${status.campaignIds[m.key]}`}
                    style={{ color: "var(--brand, #1F4A2D)" }}
                  >
                    {m.icon} {t("openChannel", { channel: m.label })}
                  </Link>
                ))}
            </div>
          </div>
        )}
        {status.state === "error" && (
          <div
            style={{
              fontSize: 12,
              color: "var(--danger, #B3261E)",
              flex: 1,
            }}
          >
            {status.message}{" "}
            <button
              type="button"
              onClick={() => onAccept(selectedChannels)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--brand, #1F4A2D)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {t("retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Rendert de inhoud van één kanaal-collapsible. Per kanaal een eigen
// vorm: mail = onderwerp + tekst, IG/FB = caption (IG + hashtags),
// WhatsApp + Google Business = enkel een body-tekst.
function renderChannelContent(
  key: BundleChannel,
  bundle: CampaignBundleCard,
  t: ReturnType<typeof useTranslations>,
) {
  const ch = bundle.channels;
  const labelStyle = {
    fontSize: 11,
    color: "var(--tl, #6B6F71)",
    marginBottom: 4,
  } as const;
  const bodyStyle = { whiteSpace: "pre-wrap", lineHeight: 1.5 } as const;

  if (key === "mail" && ch.mail) {
    return (
      <>
        <div style={labelStyle}>{t("subjectLabel")}</div>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          {ch.mail.subject_line}
        </div>
        <div style={labelStyle}>{t("bodyLabel")}</div>
        <div style={bodyStyle}>{ch.mail.body}</div>
      </>
    );
  }
  if (key === "instagram" && ch.instagram) {
    return (
      <>
        <div style={bodyStyle}>{ch.instagram.caption}</div>
        {ch.instagram.hashtags && ch.instagram.hashtags.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {ch.instagram.hashtags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  color: "var(--brand, #1F4A2D)",
                  background: "white",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </>
    );
  }
  if (key === "facebook" && ch.facebook) {
    return <div style={bodyStyle}>{ch.facebook.caption}</div>;
  }
  if (key === "tiktok" && ch.tiktok) {
    return (
      <>
        <div style={bodyStyle}>{ch.tiktok.caption}</div>
        {ch.tiktok.hashtags && ch.tiktok.hashtags.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {ch.tiktok.hashtags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  color: "var(--brand, #1F4A2D)",
                  background: "white",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </>
    );
  }
  if (key === "whatsapp" && ch.whatsapp) {
    return <div style={bodyStyle}>{ch.whatsapp.body}</div>;
  }
  if (key === "google_business" && ch.google_business) {
    return <div style={bodyStyle}>{ch.google_business.body}</div>;
  }
  return null;
}

// ============================================================
// ChannelRow, collapsible per kanaal
// ============================================================

function ChannelRow({
  icon,
  title,
  open,
  onToggle,
  checked,
  onCheckChange,
  disabled,
  children,
}: {
  icon: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  checked: boolean;
  onCheckChange: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("dash__components_filly_chat_bundle_card");
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border, #e5e5e5)",
        borderRadius: 6,
        overflow: "hidden",
        opacity: !checked && !disabled ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <div
        style={{
          width: "100%",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        {/* Checkbox links, eigen click-handler zodat klikken hier
            niet ook de collapsible toggle triggert. */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheckChange}
          disabled={disabled}
          aria-label={t("chooseChannelAria", { channel: title })}
          style={{
            cursor: disabled ? "not-allowed" : "pointer",
            accentColor: "var(--brand, #1F4A2D)",
          }}
        />
        <span>{icon}</span>
        <strong style={{ minWidth: 80 }}>{title}</strong>
        {/* Klikbaar gebied voor expand/collapse, alleen het pijltje
            rechts. Geen preview-tekst, eigenaar klikt op pijltje om
            de inhoud uit te klappen. */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={
            open
              ? t("collapseChannelAria", { channel: title })
              : t("expandChannelAria", { channel: title })
          }
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            display: "flex",
            alignItems: "center",
            color: "var(--tl, #9CA3AF)",
            fontSize: 14,
          }}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && (
        <div
          style={{
            padding: "10px",
            borderTop: "1px solid var(--border, #e5e5e5)",
            fontSize: 12,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
