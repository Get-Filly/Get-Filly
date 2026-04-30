"use client";

import { useEffect, useRef, useState } from "react";
import {
  approveSuggestion,
  fetchActiveChat,
  fetchSuggestion,
  fetchSuggestions,
  sendChatMessage,
  type AiSuggestion,
  type ChatMessage,
  type CampaignProposalCard,
} from "../../../lib/api";
import { SuggestionDetailModal } from "./suggestion-detail-modal";
import { useRestaurant } from "../../../lib/restaurant-context";
import type { ProposalStatus } from "./filly-chat-types";
import { FillyChatMessageList } from "./filly-chat-message-list";
import { FillyChatInput } from "./filly-chat-input";
import { FillyChatErrorBanner } from "./filly-chat-error-banner";

// ============================================================
// FillyChat — orchestrator-component voor de Filly-chat-card op het
// dashboard.
//
// Verantwoordelijkheden in dit bestand:
//   - State (messages, input, loading/sending, proposalStatus, modal)
//   - Restaurant-context-aware fetch van chat-historie + reeds
//     beoordeelde suggesties (approved/rejected) zodat oude proposal-
//     kaarten in de juiste eindstaat verschijnen na page-reload.
//   - Send-handler met optimistic UI + error-fallback.
//   - Approve/dismiss/openDetails-handlers voor proposal-kaarten.
//
// Render is opgesplitst in 3 sub-components zodat dit bestand
// overzichtelijk blijft:
//   - FillyChatMessageList    → render-loop + typing-dots
//   - FillyChatInput          → input + send-knop
//   - FillyChatErrorBanner    → rode foutmelding-bar
//   - FillyChatProposalCard   → wordt door MessageList gerenderd
//
// ============================================================

export function FillyChat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  // We splitsen "loading" (initial fetch) van "sending" (bericht
  // onderweg naar Filly). Dat bepaalt welke UI-toestand we tonen:
  // initial-loading = skeleton, sending = typing-dots + input disabled.
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Status per proposal-kaart. Keyen op messageId want elk Filly-
  // bericht kan max één proposal hebben.
  const [proposalStatus, setProposalStatus] = useState<
    Record<string, ProposalStatus>
  >({});
  // Welke proposal staat open in de detail-modal? Slaan de hele
  // suggestion op zodat de modal direct kan renderen zonder eerst
  // een fetch te doen — proposal-data uit de chat is al voldoende
  // voor de eerste paint.
  const [detailSuggestion, setDetailSuggestion] =
    useState<AiSuggestion | null>(null);
  // De messageId waar de open modal bij hoort, zodat we na approve
  // de juiste chat-kaart op 'created' kunnen zetten.
  const [detailMessageId, setDetailMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wacht tot de RestaurantContext een actief restaurant heeft geresolved
  // voordat we de chat-thread ophalen. Zonder deze check vuurt fetchActiveChat
  // soms af vóór localStorage de juiste restaurant-id heeft → leeg
  // X-Restaurant-Id → 400 van de backend. Context.loading afwachten
  // voorkomt die race.
  const { active: activeRestaurant, loading: restaurantLoading } =
    useRestaurant();

  useEffect(() => {
    if (restaurantLoading) return; // context is nog aan het ophalen
    if (!activeRestaurant) {
      // User heeft toegang tot geen enkel restaurant (zou niet moeten
      // kunnen gebeuren op /dashboard, maar defensief vangen).
      setLoading(false);
      setError(
        "Nog geen restaurant actief — chat is pas beschikbaar na onboarding.",
      );
      return;
    }

    let cancelled = false;
    // Parallel 3 dingen ophalen:
    //   1. chat-historie (incl. message_card)
    //   2. approved suggesties — zodat we approved chat-proposals
    //      direct als 'created' kunnen tonen met de juiste campaign-id
    //   3. rejected suggesties — voor 'dismissed'-state
    // Niet dependent op backend-JOIN-enrichment in message_card:
    // robuuster omdat het client-side werkt ongeacht schema-cache.
    Promise.all([
      fetchActiveChat(),
      fetchSuggestions("approved").catch(() => []),
      fetchSuggestions("rejected").catch(() => []),
    ])
      .then(([data, approvedSuggs, rejectedSuggs]) => {
        if (cancelled) return;
        setConversationId(data.conversationId);
        setMessages(data.messages);

        // Lookup-maps per suggestion_id. Approved → we moeten óók
        // de campaignId weten om een werkende "Bekijken →"-link te
        // geven.
        const approvedMap = new Map<string, string>(
          approvedSuggs
            .filter((s) => !!s.approved_campaign_id)
            .map((s) => [s.id, s.approved_campaign_id as string]),
        );
        const rejectedSet = new Set(rejectedSuggs.map((s) => s.id));

        const initialStatus: Record<string, ProposalStatus> = {};
        for (const msg of data.messages) {
          const card = msg.message_card;
          if (card?.kind !== "campaign_proposal") continue;
          const suggId = card.suggestion_id;
          if (!suggId) continue;
          if (approvedMap.has(suggId)) {
            initialStatus[msg.id] = {
              state: "created",
              campaignId: approvedMap.get(suggId)!,
            };
          } else if (rejectedSet.has(suggId)) {
            initialStatus[msg.id] = { state: "dismissed" };
          }
        }
        setProposalStatus(initialStatus);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError("Kon de chat niet laden. Probeer zo opnieuw.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Herlaad chat als de user van restaurant wisselt.
  }, [restaurantLoading, activeRestaurant?.id]);

  // Scrollt automatisch naar beneden bij nieuwe berichten + tijdens
  // het wachten op Filly's antwoord (zodat de typing-indicator
  // ook in beeld komt).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const sendMsg = async () => {
    const text = input.trim();
    if (!text || !conversationId || sending) return;

    setError(null);
    setInput("");
    setSending(true);

    // Optimistic UI: user-bericht direct zichtbaar. De server-response
    // geeft zo meteen een echte id + timestamp waarmee we het
    // optimistische bericht vervangen. Zo voelt de chat instant.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      role: "user",
      content: text,
      message_card: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const { userMessage, fillyMessage } = await sendChatMessage(
        conversationId,
        text,
      );
      // Vervang optimistisch bericht door server-versie + voeg Filly's
      // antwoord toe. Eén state-update om flikkering te voorkomen.
      setMessages((m) =>
        m.filter((x) => x.id !== tempId).concat([userMessage, fillyMessage]),
      );
    } catch (e) {
      // Optimistic bericht laten staan zodat de user ziet WAT ie
      // probeerde te versturen, maar met een foutbanner erboven.
      console.error(e);
      setError(
        "Filly kon niet antwoorden. Probeer nog eens (de rate-limit kan bereikt zijn).",
      );
    } finally {
      setSending(false);
    }
  };

  // Klik-handler voor "Ja, maak aan als concept". Roept de
  // approve-endpoint aan op de bij dit bericht horende suggestie
  // (backend maakt daarbij de campagne aan + koppelt approved_
  // campaign_id). Zet de kaart in 'created'-staat met de nieuwe
  // campagne-id zodat de user direct kan doorlinken.
  const acceptProposal = async (
    messageId: string,
    proposal: CampaignProposalCard,
  ) => {
    setProposalStatus((s) => ({ ...s, [messageId]: { state: "creating" } }));
    try {
      const { campaignId } = await approveSuggestion(proposal.suggestion_id);
      setProposalStatus((s) => ({
        ...s,
        [messageId]: { state: "created", campaignId },
      }));
    } catch (e) {
      console.error(e);
      setProposalStatus((s) => ({
        ...s,
        [messageId]: {
          state: "error",
          message:
            e instanceof Error
              ? e.message
              : "Opslaan mislukt. Probeer nog eens.",
        },
      }));
    }
  };

  const dismissProposal = (messageId: string) => {
    setProposalStatus((s) => ({ ...s, [messageId]: { state: "dismissed" } }));
  };

  // Modal openen voor variant-keuze + refine. We fetchen de actuele
  // suggestion (status, current selected_index) zodat de modal niet
  // staat te werken op stale data uit de chat-historie.
  const openDetails = async (
    messageId: string,
    proposal: CampaignProposalCard,
  ) => {
    setDetailMessageId(messageId);
    try {
      const sugg = await fetchSuggestion(proposal.suggestion_id);
      setDetailSuggestion(sugg);
    } catch (e) {
      console.error(e);
      setDetailMessageId(null);
    }
  };

  return (
    <div className="card chat-card">
      <div className="card-h">
        <div>
          <div className="card-t">Filly AI</div>
          <div className="card-st">Marketing-assistent</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--green)",
            }}
          />
          <span
            style={{ fontSize: 11, color: "var(--tl)", fontWeight: 500 }}
          >
            Online
          </span>
        </div>
      </div>

      <FillyChatMessageList
        ref={scrollRef}
        loading={loading}
        sending={sending}
        messages={messages}
        proposalStatus={proposalStatus}
        onAcceptProposal={acceptProposal}
        onDismissProposal={dismissProposal}
        onOpenProposalDetails={openDetails}
      />

      {error && <FillyChatErrorBanner message={error} />}

      <FillyChatInput
        value={input}
        loading={loading}
        sending={sending}
        canSend={!!conversationId}
        onChange={setInput}
        onSend={sendMsg}
      />

      {/* Detail-modal voor het bekijken/bewerken van varianten +
          refine-chat. Gestart vanaf de "Bekijk versies →"-knop in
          ProposalCard. */}
      {detailSuggestion && detailMessageId && (
        <SuggestionDetailModal
          suggestion={detailSuggestion}
          onClose={() => {
            setDetailSuggestion(null);
            setDetailMessageId(null);
          }}
          onApproved={(campaignId) => {
            setProposalStatus((s) => ({
              ...s,
              [detailMessageId]: { state: "created", campaignId },
            }));
            setDetailSuggestion(null);
            setDetailMessageId(null);
          }}
          onRejected={() => {
            setProposalStatus((s) => ({
              ...s,
              [detailMessageId]: { state: "dismissed" },
            }));
            setDetailSuggestion(null);
            setDetailMessageId(null);
          }}
          onUpdated={(updated) => {
            // Refresh de modal-state met nieuwe variant-content of
            // selected_index zonder de modal te sluiten.
            setDetailSuggestion(updated);
          }}
        />
      )}
    </div>
  );
}
