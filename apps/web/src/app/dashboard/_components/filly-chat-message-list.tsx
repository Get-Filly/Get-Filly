"use client";

import { forwardRef } from "react";
import type {
  ActiveAction,
  ActiveActionDelta,
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
import {
  FillyChatDateCard,
  type DateChoiceState,
} from "./filly-chat-date-card";
import { FillyGuidedFlow } from "./filly-guided-flow";

// ============================================================
// FillyChatMessageList, render-loop voor de chat-thread.
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
  dateChoiceState: Record<string, { state: DateChoiceState }>;
  onChooseDate: (messageId: string, followUpText: string) => void;
  // Gedeelde lopende actie (audit-item #8): de geleide flow seed't z'n
  // begintoestand hieruit en meldt keuzes terug via onActiveActionChange.
  activeAction: ActiveAction | null;
  onActiveActionChange: (delta: ActiveActionDelta) => void;
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
      dateChoiceState,
      onAcceptProposal,
      onDismissProposal,
      onOpenProposalDetails,
      onAcceptBundle,
      onDismissBundle,
      onChooseChannel,
      onChooseDate,
      activeAction,
      onActiveActionChange,
    },
    scrollRef,
  ) {
    // System-berichten zijn gereserveerd voor latere notificaties en
    // worden nooit getoond. Een gesprek zonder zichtbare berichten =
    // leeg → toon de geleide on-ramp (FillyGuidedFlow) i.p.v. een
    // kaal vlak.
    const visible = messages.filter((m) => m.role !== "system");
    // Per gesprek is er één lopende actie, dus maar één interactieve flow:
    // alléén de LAATSTE guided_start-kaart rendert de klikbare FillyGuidedFlow.
    // Oudere guided_start-kaarten tonen enkel hun prozatekst (geen flow),
    // anders stapelen er meerdere flows die allemaal aan dezelfde
    // active_action hangen en bij elke nieuwe beurt "meeveranderen".
    const lastGuidedStartId =
      [...visible]
        .reverse()
        .find(
          (m) => m.role === "filly" && m.message_card?.kind === "guided_start",
        )?.id ?? null;
    return (
      <div className="chat-msgs" ref={scrollRef}>
        {loading ? (
          // Skeleton-bubbels i.p.v. platte "Chat laden…"-tekst: leest
          // rustiger en geeft alvast de vorm van het gesprek aan.
          <div className="chat-skel" aria-hidden="true">
            <div className="chat-skel-row ai">
              <span className="chat-skel-bubble w70" />
            </div>
            <div className="chat-skel-row user">
              <span className="chat-skel-bubble w50" />
            </div>
            <div className="chat-skel-row ai">
              <span className="chat-skel-bubble w80" />
            </div>
          </div>
        ) : visible.length === 0 && !sending ? (
          // Lege-chat-staat: de volledige flow. Seed vanuit een eventuele
          // lopende actie (zeldzaam in de lege staat, maar dan klopt 'ie).
          <FillyGuidedFlow
            initialDate={activeAction?.date}
            initialTopic={activeAction?.topic}
            onActionChange={onActiveActionChange}
          />
        ) : (
          visible.map((m) =>
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
                  {m.message_card?.kind === "date_choice" && (
                    <FillyChatDateCard
                      card={m.message_card}
                      state={dateChoiceState[m.id]?.state ?? "pending"}
                      onChoose={(followUpText) =>
                        onChooseDate(m.id, followUpText)
                      }
                    />
                  )}
                  {m.message_card?.kind === "guided_start" &&
                    m.id === lastGuidedStartId && (
                      // Alléén de laatste guided_start-kaart is de actieve,
                      // klikbare flow. Voorgevuld met datum/thema uit de kaart
                      // zelf (server-gevuld vanuit de lopende actie) — geen
                      // live-active_action-fallback meer, want die lekte de
                      // huidige actie in álle oudere kaarten.
                      <FillyGuidedFlow
                        initialDate={m.message_card.date}
                        initialTopic={m.message_card.topic}
                        onActionChange={onActiveActionChange}
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
          // Typing-indicator met Filly-avatar zodat 't leest als
          // "Filly is aan het typen". aria-live kondigt 't aan voor
          // schermlezers; de sr-tekst geeft de betekenis.
          <div
            className="typing-row"
            role="status"
            aria-live="polite"
          >
            <span className="msg-avatar">F</span>
            <div className="typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="sr-only">Filly is aan het typen…</span>
          </div>
        )}
      </div>
    );
  },
);
