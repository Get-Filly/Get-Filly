"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { CampaignProposalCard } from "@/lib/api";
import type { ProposalStatus } from "./filly-chat-types";

// ============================================================
// FillyChatProposalCard, inline kaartje onder een Filly-bericht dat
// een campagne voorstelt. Toont type + titel + (bij mail) onderwerp +
// 2-3 knoppen: aanmaken, afwijzen, eventueel "Bekijk versies" (alleen
// bij meerdere varianten). Na klik verandert de UI naar een van de
// 5 ProposalStatus-states. De volledige body van de campagne tonen
// we bewust NIET opnieuw, die staat al in het Filly-bericht erboven.
// ============================================================
export function FillyChatProposalCard({
  proposal,
  status,
  onAccept,
  onDismiss,
  onOpenDetails,
}: {
  proposal: CampaignProposalCard;
  status: ProposalStatus;
  onAccept: () => void;
  onDismiss: () => void;
  onOpenDetails: () => void;
}) {
  const t = useTranslations("dash__components_filly_chat_proposal_card");

  const typeLabel =
    proposal.type === "mail"
      ? t("typeMail")
      : proposal.type === "social"
        ? t("typeSocial")
        : t("typeWhatsapp");

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 8,
        background: "var(--accent-light, #D6E0D8)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--accent, #1F4A2D)",
        }}
      >
        <span>{t("proposalLabel")}</span>
        <span
          style={{
            padding: "1px 8px",
            background: "var(--accent, #1F4A2D)",
            color: "white",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {typeLabel}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
        {proposal.name}
      </div>
      {/* Pak de geselecteerde variant (default 0). Toon onderwerp +
          korte body-preview zodat user zonder modal-klik kan zien
          wat er gemaakt wordt. */}
      {(() => {
        const variant =
          proposal.variants?.[proposal.selected_index ?? 0] ?? null;
        const subject = variant?.subject_line;
        return (
          <>
            {subject && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  marginBottom: 4,
                }}
              >
                {t("subject", { subject })}
              </div>
            )}
            {proposal.variants && proposal.variants.length > 1 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary, #52525B)",
                  marginBottom: 4,
                  fontStyle: "italic",
                }}
              >
                {t("multipleVersions", { count: proposal.variants.length })}
              </div>
            )}
          </>
        );
      })()}

      {status.state === "pending" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onAccept}
            style={{
              padding: "6px 12px",
              background: "var(--accent, #1F4A2D)",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t("accept")}
          </button>
          {proposal.variants && proposal.variants.length > 1 && (
            <button
              onClick={onOpenDetails}
              style={{
                padding: "6px 12px",
                background: "transparent",
                color: "var(--accent, #1F4A2D)",
                border: "1px solid var(--accent, #1F4A2D)",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t("viewVersions")}
            </button>
          )}
          <button
            onClick={onDismiss}
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: "var(--text-secondary, #52525B)",
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("decline")}
          </button>
        </div>
      )}

      {status.state === "creating" && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--text-secondary, #52525B)",
          }}
        >
          {t("creating")}
        </div>
      )}

      {status.state === "created" && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--accent, #1F4A2D)",
          }}
        >
          {t("created")}{" "}
          <Link
            href={`/dashboard/campagnes/${status.campaignId}`}
            style={{
              color: "var(--accent, #1F4A2D)",
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            {t("view")}
          </Link>
        </div>
      )}

      {status.state === "dismissed" && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            fontStyle: "italic",
          }}
        >
          {t("dismissed")}
        </div>
      )}

      {status.state === "error" && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 8px",
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {status.message}{" "}
          <button
            onClick={onAccept}
            style={{
              marginLeft: 4,
              background: "none",
              border: "none",
              color: "var(--red, #b00)",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t("retry")}
          </button>
        </div>
      )}
    </div>
  );
}
