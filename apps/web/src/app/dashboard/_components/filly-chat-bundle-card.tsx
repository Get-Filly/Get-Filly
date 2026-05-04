"use client";

import { useState } from "react";
import Link from "next/link";
import type { BundleChannel, CampaignBundleCard } from "../../../lib/api";

// ============================================================
// FillyChatBundleCard — multi-channel-voorstel kaart in chat
// ============================================================
//
// Wordt onder Filly-berichten getoond wanneer message_card.kind ===
// 'campaign_bundle'. Toont:
//   - bundle-naam + thema
//   - 3 collapsibles (mail / Instagram / Facebook), default ingeklapt
//     zodat de chat-bubble niet te groot wordt
//   - 1 actieknop "Accepteer alle 3" of dismiss
//
// Na accept: 3 per-kanaal-links naar de aangemaakte campagne-detail-
// pagina's. Eigenaar klikt door en pusht daar per kanaal (mail werkt
// echt via Resend; IG/FB tonen tot Meta-OAuth live is een
// "Kopieer en plaats zelf"-flow).
//
// Status-states zijn parallel aan FillyChatProposalCard maar met een
// eigen tagged-union zodat we de drie campaign-IDs kunnen bewaren.
// ============================================================

export type BundleStatus =
  | { state: "pending" }
  | { state: "creating" }
  | {
      state: "created";
      mailCampaignId: string | null;
      instagramCampaignId: string | null;
      facebookCampaignId: string | null;
    }
  // Sinds 2026-05-04: bij chat-history-load detecteren we of de bundle
  // al eerder geaccepteerd is via de approved-suggesties. We weten dan
  // alleen het anker-campagne-id (de mail-campagne uit approved_campaign_id).
  // De andere twee staan via group_id in de campagnes-lijst, daarom een
  // generieke "Open campagnes"-link.
  | {
      state: "approved_existing";
      anchorCampaignId: string;
    }
  | { state: "dismissed" }
  | { state: "error"; message: string };

type Props = {
  bundle: CampaignBundleCard;
  status: BundleStatus;
  // Eigenaar selecteert welke kanalen 'ie daadwerkelijk wil aanmaken.
  // Default in parent = alle 3.
  onAccept: (channels: BundleChannel[]) => void;
  onDismiss: () => void;
};

export function FillyChatBundleCard({
  bundle,
  status,
  onAccept,
  onDismiss,
}: Props) {
  const [openChannel, setOpenChannel] = useState<BundleChannel | null>(null);

  // Welke kanalen heeft eigenaar aangevinkt? Default alle 3 — meest
  // gangbare keuze. Bij uitvinken zien we direct dat de campagne dan
  // niet aangemaakt zal worden.
  const [selected, setSelected] = useState<Record<BundleChannel, boolean>>({
    mail: true,
    instagram: true,
    facebook: true,
  });

  if (status.state === "dismissed") return null;

  const toggle = (key: BundleChannel) => {
    setOpenChannel((cur) => (cur === key ? null : key));
  };

  const toggleSelected = (key: BundleChannel) => {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  };

  const selectedChannels: BundleChannel[] = (
    ["mail", "instagram", "facebook"] as BundleChannel[]
  ).filter((c) => selected[c]);
  const selectedCount = selectedChannels.length;

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
          MULTI-KANAAL
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

      {/* Drie collapsibles, één per kanaal — met checkbox voor selectie.
          Default alle 3 aangevinkt; eigenaar kan uitvinken om dat kanaal
          over te slaan bij Accepteren. Kies-tekst alleen tonen bij pending. */}
      {status.state === "pending" && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--tl, #6B6F71)",
            marginBottom: 4,
          }}
        >
          Kies welke kanalen je wil aanmaken:
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <ChannelRow
          icon="✉️"
          title="Mail"
          summary={bundle.channels.mail.subject_line}
          open={openChannel === "mail"}
          onToggle={() => toggle("mail")}
          checked={selected.mail}
          onCheckChange={() => toggleSelected("mail")}
          disabled={status.state !== "pending" && status.state !== "error"}
        >
          <div style={{ fontSize: 11, color: "var(--tl, #6B6F71)", marginBottom: 4 }}>
            Onderwerp
          </div>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            {bundle.channels.mail.subject_line}
          </div>
          <div style={{ fontSize: 11, color: "var(--tl, #6B6F71)", marginBottom: 4 }}>
            Tekst
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {bundle.channels.mail.body}
          </div>
        </ChannelRow>

        <ChannelRow
          icon="📷"
          title="Instagram"
          summary={truncate(bundle.channels.instagram.caption, 60)}
          open={openChannel === "instagram"}
          onToggle={() => toggle("instagram")}
          checked={selected.instagram}
          onCheckChange={() => toggleSelected("instagram")}
          disabled={status.state !== "pending" && status.state !== "error"}
        >
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {bundle.channels.instagram.caption}
          </div>
          {bundle.channels.instagram.hashtags &&
            bundle.channels.instagram.hashtags.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                }}
              >
                {bundle.channels.instagram.hashtags.map((tag) => (
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
        </ChannelRow>

        <ChannelRow
          icon="📘"
          title="Facebook"
          summary={truncate(bundle.channels.facebook.caption, 60)}
          open={openChannel === "facebook"}
          onToggle={() => toggle("facebook")}
          checked={selected.facebook}
          onCheckChange={() => toggleSelected("facebook")}
          disabled={status.state !== "pending" && status.state !== "error"}
        >
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {bundle.channels.facebook.caption}
          </div>
        </ChannelRow>
      </div>

      {/* Acties — verschilt per status */}
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
                selectedCount === 0
                  ? "Selecteer minimaal één kanaal om aan te maken"
                  : undefined
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
                ? "Selecteer een kanaal"
                : selectedCount === 1
                  ? "Maak 1 campagne aan"
                  : `Maak ${selectedCount} campagnes aan`}
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
              Niet nu
            </button>
          </>
        )}
        {status.state === "creating" && (
          <div style={{ fontSize: 12, color: "var(--tl, #6B6F71)" }}>
            Bezig met aanmaken van 3 campagnes…
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
              ✓ Bundle al aangemaakt
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href={`/dashboard/campagnes/${status.anchorCampaignId}`}
                style={{ color: "var(--brand, #1F4A2D)" }}
              >
                ✉️ Open campagne
              </Link>
              <Link
                href="/dashboard/campagnes"
                style={{ color: "var(--brand, #1F4A2D)" }}
              >
                → Alle campagnes
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
              ✓ Concept-campagnes klaar
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {status.mailCampaignId && (
                <Link
                  href={`/dashboard/campagnes/${status.mailCampaignId}`}
                  style={{ color: "var(--brand, #1F4A2D)" }}
                >
                  ✉️ Open mail
                </Link>
              )}
              {status.instagramCampaignId && (
                <Link
                  href={`/dashboard/campagnes/${status.instagramCampaignId}`}
                  style={{ color: "var(--brand, #1F4A2D)" }}
                >
                  📷 Open Instagram
                </Link>
              )}
              {status.facebookCampaignId && (
                <Link
                  href={`/dashboard/campagnes/${status.facebookCampaignId}`}
                  style={{ color: "var(--brand, #1F4A2D)" }}
                >
                  📘 Open Facebook
                </Link>
              )}
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
              Probeer opnieuw
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ChannelRow — collapsible per kanaal
// ============================================================

function ChannelRow({
  icon,
  title,
  summary,
  open,
  onToggle,
  checked,
  onCheckChange,
  disabled,
  children,
}: {
  icon: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  checked: boolean;
  onCheckChange: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
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
        {/* Checkbox links — eigen click-handler zodat klikken hier
            niet ook de collapsible toggle triggert. */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheckChange}
          disabled={disabled}
          aria-label={`${title} kiezen`}
          style={{
            cursor: disabled ? "not-allowed" : "pointer",
            accentColor: "var(--brand, #1F4A2D)",
          }}
        />
        <span>{icon}</span>
        <strong style={{ minWidth: 80 }}>{title}</strong>
        {/* Klikbaar gebied voor expand/collapse — alleen de tekst en
            chevron, niet de checkbox. */}
        <button
          type="button"
          onClick={onToggle}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "inherit",
          }}
        >
          <span
            style={{
              color: "var(--tl, #6B6F71)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary}
          </span>
          <span style={{ color: "var(--tl, #9CA3AF)" }}>{open ? "▾" : "▸"}</span>
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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}
