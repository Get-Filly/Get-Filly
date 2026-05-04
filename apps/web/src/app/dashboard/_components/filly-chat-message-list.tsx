"use client";

import { forwardRef } from "react";
import type {
  BundleChannel,
  ChatMessage,
  CampaignProposalCard,
  CampaignBundleCard,
  ChannelChoiceCard,
} from "../../../lib/api";
import type { ProposalStatus } from "./filly-chat-types";
import { FillyChatProposalCard } from "./filly-chat-proposal-card";
import {
  FillyChatBundleCard,
  type BundleStatus,
} from "./filly-chat-bundle-card";
import {
  FillyChatChoiceCard,
  type ChannelChoice,
  type ChoiceState,
} from "./filly-chat-choice-card";

// ============================================================
// FillyChatMessageList — render-loop voor de chat-thread.
//
// Verantwoordelijkheden:
//   1. Loading-state ("Chat laden…") tijdens initial fetch
//   2. Filter system-messages (gereserveerd voor latere notificaties)
//   3. Render Filly- vs user-bubbles met correct stijl + label
//   4. Render proposal-card onder Filly-berichten met message_card
//   5. Typing-dots tijdens 'sending' (Filly is aan het denken)
//
// We gebruiken forwardRef zodat de orchestrator de scrollRef kan
// vasthouden en bij nieuwe berichten naar beneden kan scrollen.
// Dit voorkomt prop-drilling van een ref via een extra wrapper.
// ============================================================

type Props = {
  loading: boolean;
  sending: boolean;
  messages: ChatMessage[];
  proposalStatus: Record<string, ProposalStatus>;
  bundleStatus: Record<string, BundleStatus>;
  onAcceptProposal: (
    messageId: string,
    proposal: CampaignProposalCard,
  ) => void;
  onDismissProposal: (messageId: string) => void;
  onOpenProposalDetails: (
    messageId: string,
    proposal: CampaignProposalCard,
  ) => void;
  onAcceptBundle: (
    messageId: string,
    bundle: CampaignBundleCard,
    channels: BundleChannel[],
  ) => void;
  onDismissBundle: (messageId: string) => void;
  choiceState: Record<
    string,
    { state: ChoiceState; chosen?: ChannelChoice }
  >;
  onChooseChannel: (messageId: string, choices: ChannelChoice[]) => void;
};

export const FillyChatMessageList = forwardRef<HTMLDivElement, Props>(
  function FillyChatMessageList(
    {
      loading,
      sending,
      messages,
      proposalStatus,
      bundleStatus,
      choiceState,
      onAcceptProposal,
      onDismissProposal,
      onOpenProposalDetails,
      onAcceptBundle,
      onDismissBundle,
      onChooseChannel,
    },
    scrollRef,
  ) {
    return (
      <div className="chat-msgs" ref={scrollRef}>
        {loading ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--tl)" }}>
            Chat laden…
          </div>
        ) : (
          messages
            .filter((m) => m.role !== "system")
            .map((m) =>
              m.role === "filly" ? (
                <div key={m.id} className="msg msg-ai">
                  <div className="msg-lbl">
                    <span className="msg-avatar">F</span>
                    <span>Filly AI</span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                  {m.message_card?.kind === "campaign_proposal" && (
                    <FillyChatProposalCard
                      proposal={m.message_card}
                      status={proposalStatus[m.id] ?? { state: "pending" }}
                      onAccept={() =>
                        onAcceptProposal(
                          m.id,
                          m.message_card as CampaignProposalCard,
                        )
                      }
                      onDismiss={() => onDismissProposal(m.id)}
                      onOpenDetails={() =>
                        onOpenProposalDetails(
                          m.id,
                          m.message_card as CampaignProposalCard,
                        )
                      }
                    />
                  )}
                  {m.message_card?.kind === "campaign_bundle" && (
                    <FillyChatBundleCard
                      bundle={m.message_card}
                      status={bundleStatus[m.id] ?? { state: "pending" }}
                      onAccept={(channels) =>
                        onAcceptBundle(
                          m.id,
                          m.message_card as CampaignBundleCard,
                          channels,
                        )
                      }
                      onDismiss={() => onDismissBundle(m.id)}
                    />
                  )}
                  {m.message_card?.kind === "channel_choice" && (
                    <FillyChatChoiceCard
                      card={m.message_card}
                      state={choiceState[m.id]?.state ?? "pending"}
                      chosen={choiceState[m.id]?.chosen}
                      onChoose={(choices) => onChooseChannel(m.id, choices)}
                    />
                  )}
                </div>
              ) : (
                <div key={m.id} className="msg msg-user">
                  <div className="msg-lbl">Jij</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              ),
            )
        )}
        {sending && (
          <div className="typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
      </div>
    );
  },
);
