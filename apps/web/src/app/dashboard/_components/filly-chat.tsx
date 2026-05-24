"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveBundleSuggestion,
  approveSuggestion,
  createChatConversation,
  deleteChatConversation,
  fetchActiveChat,
  fetchChatConversation,
  fetchChatConversations,
  fetchSuggestions,
  sendChatMessage,
  CHAT_CONVERSATION_CAP,
  type BundleChannel,
  type CampaignBundleCard,
  type ChannelChoiceCard,
  type ChatConversationSummary,
  type ChatMessage,
  type CampaignProposalCard,
} from "../../../lib/api";
import type { BundleStatus } from "./filly-chat-bundle-card";
import type {
  ChannelChoice,
  ChoiceState,
} from "./filly-chat-choice-card";
import type { DateChoiceState } from "./filly-chat-date-card";
import { useRestaurant } from "../../../lib/restaurant-context";
import type { ProposalStatus } from "./filly-chat-types";
import { FillyChatMessageList } from "./filly-chat-message-list";
import { FillyChatInput } from "./filly-chat-input";
import { FillyChatErrorBanner } from "./filly-chat-error-banner";
import { FillyChatHistoryMenu } from "./filly-chat-history-menu";

// ============================================================
// FillyChat, orchestrator-component voor de Filly-chat-card op het
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
  const [messageCount, setMessageCount] = useState(0);
  const [conversations, setConversations] = useState<
    ChatConversationSummary[]
  >([]);
  const [input, setInput] = useState("");
  // We splitsen "loading" (initial fetch) van "sending" (bericht
  // onderweg naar Filly). Dat bepaalt welke UI-toestand we tonen:
  // initial-loading = skeleton, sending = typing-dots + input disabled.
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cap-bereikt detector: zodra de conversatie aan z'n max berichten
  // zit (CHAT_CONVERSATION_CAP=20) togglen we naar een "vol"-mode
  // waar de input verdwijnt en een "+ Nieuw gesprek"-CTA verschijnt.
  // Wordt gezet wanneer messageCount >= cap NA een succesvolle send,
  // óf wanneer backend een 400 met cap-bereikt-tekst gooit (defensief).
  const capReached = messageCount >= CHAT_CONVERSATION_CAP;
  // Status per proposal-kaart. Keyen op messageId want elk Filly-
  // bericht kan max één proposal hebben.
  const [proposalStatus, setProposalStatus] = useState<
    Record<string, ProposalStatus>
  >({});
  // Status per bundle-card (multi-channel proposal). Keyen op
  // messageId zodat één bericht ook hier max één bundle heeft.
  const [bundleStatus, setBundleStatus] = useState<
    Record<string, BundleStatus>
  >({});
  // Status per choice-card (kanaal-keuze-vraag). Keyen op messageId.
  // Bij klik op een knop sturen we een follow-up user-msg en zetten
  // de keuze op 'submitting' tot de Filly-roundtrip klaar is.
  const [choiceState, setChoiceState] = useState<
    Record<string, { state: ChoiceState; chosen?: ChannelChoice }>
  >({});
  // Per 2026-05-24: date-choice voor de kanaal-keuze. Bij klik op een
  // datum-knop sturen we een follow-up "Voor [datum]" zodat Filly de
  // gekozen target meeneemt in de volgende beurt.
  const [dateChoiceState, setDateChoiceState] = useState<
    Record<string, { state: DateChoiceState }>
  >({});
  // Per 2026-05-07: detail-modal-state weg, voorstel-detail is nu een
  // eigen route /dashboard/campagnes/voorstel/[id]. We navigeren bij
  // klik op 'Bekijk versies' rechtstreeks via router.push.
  const router = useRouter();
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
        "Nog geen restaurant actief, chat is pas beschikbaar na onboarding.",
      );
      return;
    }

    let cancelled = false;
    // Parallel 4 dingen ophalen:
    //   1. chat-historie (incl. message_card + messageCount)
    //   2. approved suggesties, voor 'created'-state op proposal-cards
    //   3. rejected suggesties, voor 'dismissed'-state
    //   4. lijst conversaties, voor de history-dropdown in de header
    Promise.all([
      fetchActiveChat(),
      fetchSuggestions("approved").catch(() => []),
      fetchSuggestions("rejected").catch(() => []),
      fetchChatConversations().catch(() => []),
    ])
      .then(([data, approvedSuggs, rejectedSuggs, convs]) => {
        if (cancelled) return;
        setConversationId(data.conversationId);
        setMessages(data.messages);
        setMessageCount(data.messageCount);
        setConversations(convs);

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
        // Aparte map voor bundle-cards. Net als bij single-channel
        // proposals: na page-reload moet de UI weten welke bundles al
        // geaccepteerd waren (anders kan eigenaar 'm 2× accepteren).
        const initialBundleStatus: Record<string, BundleStatus> = {};

        for (const msg of data.messages) {
          const card = msg.message_card;
          if (!card) continue;
          // channel_choice + date_choice hebben geen ai_suggestion
          // erachter, skip.
          if (card.kind === "channel_choice" || card.kind === "date_choice")
            continue;
          const suggId = card.suggestion_id;
          if (!suggId) continue;

          if (card.kind === "campaign_proposal") {
            if (approvedMap.has(suggId)) {
              initialStatus[msg.id] = {
                state: "created",
                campaignId: approvedMap.get(suggId)!,
              };
            } else if (rejectedSet.has(suggId)) {
              initialStatus[msg.id] = { state: "dismissed" };
            }
          } else if (card.kind === "campaign_bundle") {
            if (approvedMap.has(suggId)) {
              // Bundle is al geaccepteerd, toon "approved_existing"-state
              // met anker naar de mail-campagne. De andere 2 sub-campagnes
              // zijn via campagnes-pagina (group_id) bereikbaar.
              initialBundleStatus[msg.id] = {
                state: "approved_existing",
                anchorCampaignId: approvedMap.get(suggId)!,
              };
            } else if (rejectedSet.has(suggId)) {
              initialBundleStatus[msg.id] = { state: "dismissed" };
            }
          }
        }
        setProposalStatus(initialStatus);
        setBundleStatus(initialBundleStatus);
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

  // Refactored 2026-05-04: send-logica in een herbruikbare sendText(text)
  // zodat de choice-card-handler ('chooseChannel') 'm ook kan triggeren
  // zonder dat de eigenaar via de input-veld hoeft te typen.
  const sendText = async (text: string) => {
    if (!text || !conversationId || sending) return;

    setError(null);
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
      // Counter +2 (user + filly). Bij cap-bereikt togglet capReached
      // automatisch via de derived constant, geen aparte setter nodig.
      setMessageCount((c) => c + 2);
      // Conversations-lijst refresh (titel kan net gegenereerd zijn,
      // counts kloppen). Fire-and-forget; faalt het, dan toont de
      // dropdown gewoon stale data tot volgende navigatie.
      void fetchChatConversations()
        .then(setConversations)
        .catch(() => undefined);
    } catch (e) {
      // Twee soorten fouten:
      //   1. Cap-bereikt (400 met specifieke NL-tekst): user mocht
      //      niet sturen, optimistisch bericht weghalen + capReached
      //      forceren door messageCount op cap te zetten.
      //   2. Andere fout (rate-limit, Claude down): optimistisch
      //      bericht laten staan + foutbanner erboven.
      const errMsg = e instanceof Error ? e.message : "Onbekende fout.";
      const isCap = errMsg.includes("grens van 20") || errMsg.includes("nieuw gesprek");
      if (isCap) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setMessageCount(CHAT_CONVERSATION_CAP);
        setError(errMsg);
      } else {
        console.error(e);
        setError(
          "Filly kon niet antwoorden. Probeer nog eens (de rate-limit kan bereikt zijn).",
        );
      }
    } finally {
      setSending(false);
    }
  };

  // Wrapper voor de input-veld-flow: pak input, leeg 't, stuur.
  const sendMsg = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  };

  // Eigenaar klikt op Verstuur in een ChannelChoiceCard met 1+ keuzes.
  // We bouwen een passende follow-up-tekst voor Filly:
  //   - 1 single-kanaal           → "Maak een [kanaal]-campagne/post"
  //   - 2+ kanalen zonder GBP     → "Maak een bundel-campagne (...)"
  //   - 2+ kanalen met GBP        → "Maak een bundel voor X, Y + aparte
  //                                  Google Business-post" (GBP wordt
  //                                  niet ondersteund in bundle, zie
  //                                  campaign-checks.toBundleChannel)
  // Filly's server-side hint herkent de keywords en stuurt het juiste
  // formaat (single proposal of bundle) terug.
  const chooseChannel = async (
    messageId: string,
    choices: ChannelChoice[],
  ) => {
    if (choices.length === 0) return;

    setChoiceState((s) => ({
      ...s,
      [messageId]: { state: "submitting", chosen: choices[0] },
    }));

    let promptText: string;
    if (choices.length === 1) {
      const single = choices[0];
      promptText =
        single === "mail"
          ? "Maak een mail-campagne"
          : single === "instagram"
            ? "Maak een Instagram-post"
            : single === "facebook"
              ? "Maak een Facebook-post"
              : single === "whatsapp"
                ? "Maak een WhatsApp-bericht"
                : "Maak een Google Business-post";
    } else {
      // GBP wordt apart afgesplitst: bundle-backend ondersteunt 'm
      // niet. Filly genereert eerst de bundle, daarna in een
      // vervolgbericht de losse GBP-post.
      const hasGbp = choices.includes("google_business");
      const others = choices.filter((c) => c !== "google_business");

      const labelFor = (c: ChannelChoice): string =>
        c === "mail"
          ? "mail"
          : c === "instagram"
            ? "Instagram"
            : c === "facebook"
              ? "Facebook"
              : c === "whatsapp"
                ? "WhatsApp"
                : "Google Business";

      if (hasGbp && others.length === 0) {
        // Alleen GBP aangevinkt (kan, multi-select toestaat het).
        promptText = "Maak een Google Business-post";
      } else if (hasGbp && others.length === 1) {
        // GBP + 1 ander → twee aparte voorstellen, geen bundel.
        promptText = `Maak twee voorstellen: een ${labelFor(others[0])}-bericht en een Google Business-post.`;
      } else if (hasGbp) {
        // GBP + 2+ andere → bundel voor de rest + losse GBP.
        const labels = others.map(labelFor);
        promptText = `Maak een bundel-campagne voor ${labels.join(", ")} en daarnaast een aparte Google Business-post.`;
      } else {
        // 2+ kanalen zonder GBP → normale bundle.
        const labels = others.map(labelFor);
        promptText = `Maak een bundel-campagne voor ${labels.join(", ")}`;
      }
    }

    try {
      await sendText(promptText);
      setChoiceState((s) => ({
        ...s,
        [messageId]: { state: "chosen", chosen: choices[0] },
      }));
    } catch {
      setChoiceState((s) => ({
        ...s,
        [messageId]: { state: "pending", chosen: undefined },
      }));
    }
  };

  // Eigenaar klikt op een knop in een DateChoiceCard. We sturen de
  // bijbehorende follow-up-tekst ("Voor zaterdag" / "Voor 10 mei 2026")
  // als gewoon user-bericht; Filly's volgende beurt is dan ofwel een
  // kanaal-keuze-card (FORMAAT 0B) of direct een proposal (FORMAAT 1/2).
  const chooseDate = async (messageId: string, followUpText: string) => {
    if (!followUpText.trim()) return;
    setDateChoiceState((s) => ({ ...s, [messageId]: { state: "submitting" } }));
    try {
      await sendText(followUpText);
      setDateChoiceState((s) => ({ ...s, [messageId]: { state: "chosen" } }));
    } catch {
      setDateChoiceState((s) => ({ ...s, [messageId]: { state: "pending" } }));
    }
  };

  // Switch naar een andere conversatie via de history-dropdown.
  // Vervangt messages/count, refresh proposal-statussen niet (die
  // worden uit message_card gelezen, bij switch krijgen we al
  // de juiste data terug).
  const switchConversation = async (id: string) => {
    if (id === conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChatConversation(id);
      setConversationId(data.conversationId);
      setMessages(data.messages);
      setMessageCount(data.messageCount);
      // Proposal-statussen resetten naar leeg; ze worden uit message_card
      // bij volgende render afgeleid (pending = default als geen entry).
      setProposalStatus({});
    } catch (e) {
      console.error(e);
      setError("Kon dit gesprek niet laden.");
    } finally {
      setLoading(false);
    }
  };

  // Start een nieuw leeg gesprek. Aangeroepen door dropdown OR door
  // de "+ Nieuw gesprek"-knop bij cap-bereikt. Refresh de lijst
  // achteraf zodat 't nieuwe gesprek bovenaan komt.
  const startNewConversation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await createChatConversation();
      setConversationId(data.conversationId);
      setMessages(data.messages);
      setMessageCount(data.messageCount);
      setProposalStatus({});
      const convs = await fetchChatConversations().catch(() => []);
      setConversations(convs);
    } catch (e) {
      console.error(e);
      setError("Kon geen nieuw gesprek starten.");
    } finally {
      setLoading(false);
    }
  };

  // Verwijder een conversatie. Backend bewaart eerst de Haiku-summary
  // in restaurant_chat_memory zodat geleerde voorkeuren behouden
  // blijven. Bij delete van de actieve conversatie: switch automatisch
  // naar een nieuwe lege chat, anders zou eigenaar in een 404-state
  // belanden.
  const deleteConversation = async (id: string) => {
    const wasActive = id === conversationId;
    try {
      await deleteChatConversation(id);
      // Lijst opnieuw ophalen, minst foutgevoelige aanpak.
      const convs = await fetchChatConversations().catch(() => []);
      setConversations(convs);
      // Bij delete van de actieve: nieuw gesprek starten zodat de
      // chat-card niet leeg blijft hangen.
      if (wasActive) {
        await startNewConversation();
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Verwijderen mislukt. Probeer 't opnieuw.",
      );
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

  // Bundle-accept: zelfde pattern als proposal, maar via approve-bundle
  // endpoint. Returnt 3 campaign-IDs + 1 group-id zodat de kaart
  // doorlinks naar elk kanaal kan tonen.
  const acceptBundle = async (
    messageId: string,
    bundle: CampaignBundleCard,
    channels: BundleChannel[],
  ) => {
    setBundleStatus((s) => ({ ...s, [messageId]: { state: "creating" } }));
    try {
      const result = await approveBundleSuggestion(
        bundle.suggestion_id,
        channels,
      );
      setBundleStatus((s) => ({
        ...s,
        [messageId]: {
          state: "created",
          mailCampaignId: result.mailCampaignId,
          instagramCampaignId: result.instagramCampaignId,
          facebookCampaignId: result.facebookCampaignId,
        },
      }));
    } catch (e) {
      console.error(e);
      setBundleStatus((s) => ({
        ...s,
        [messageId]: {
          state: "error",
          message:
            e instanceof Error
              ? e.message
              : "Bundle-aanmaken mislukt. Probeer nog eens.",
        },
      }));
    }
  };

  const dismissBundle = (messageId: string) => {
    setBundleStatus((s) => ({ ...s, [messageId]: { state: "dismissed" } }));
  };

  const dismissProposal = (messageId: string) => {
    setProposalStatus((s) => ({ ...s, [messageId]: { state: "dismissed" } }));
  };

  // Per 2026-05-07: voorstel-detail is nu een eigen route i.p.v. een
  // modal binnen de chat. We navigeren rechtstreeks; de chat-side-
  // effects (proposal-status updaten na approve/reject) gebeuren
  // wanneer de eigenaar weer in de chat terug-komt en de pending-list
  // refresht. Dit is een tijdelijke regressie; in fase 2 koppelen we
  // chat-status weer terug via een refresh-on-return.
  const openDetails = (
    _messageId: string,
    proposal: CampaignProposalCard,
  ) => {
    router.push(`/dashboard/campagnes/voorstel/${proposal.suggestion_id}`);
  };

  return (
    <div className="card chat-card">
      <div className="card-h">
        <div>
          <div className="card-t">Filly AI</div>
          <div className="card-st">
            Marketing-assistent
            {/* Bericht-X-van-20-indicator. Alleen bij ≥10 berichten
                tonen, anders is 't visuele ruis. Geel/oranje vanaf
                15 zodat de eigenaar ziet dat 'ie tegen de cap aanloopt. */}
            {messageCount >= 10 && (
              <span
                style={{
                  marginLeft: 8,
                  color:
                    messageCount >= 15
                      ? "var(--color-warning)"
                      : "var(--color-text-disabled)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                · Bericht {messageCount} / {CHAT_CONVERSATION_CAP}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FillyChatHistoryMenu
            conversations={conversations}
            activeConversationId={conversationId}
            onSwitch={switchConversation}
            onNew={startNewConversation}
            onDelete={deleteConversation}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--color-success)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-disabled)",
                fontWeight: 500,
              }}
            >
              Online
            </span>
          </div>
        </div>
      </div>

      <FillyChatMessageList
        ref={scrollRef}
        loading={loading}
        sending={sending}
        messages={messages}
        proposalStatus={proposalStatus}
        bundleStatus={bundleStatus}
        choiceState={choiceState}
        dateChoiceState={dateChoiceState}
        onChooseDate={chooseDate}
        onAcceptProposal={acceptProposal}
        onDismissProposal={dismissProposal}
        onOpenProposalDetails={openDetails}
        onAcceptBundle={acceptBundle}
        onDismissBundle={dismissBundle}
        onChooseChannel={chooseChannel}
      />

      {error && <FillyChatErrorBanner message={error} />}

      {capReached ? (
        // Cap-bereikt: input verbergen, vervangen door duidelijke CTA.
        // Filly heeft de chat al samengevat in restaurant_chat_memory
        // (background-call bij cap-bereikt), vandaar de "onthoudt
        // wat 'ie heeft geleerd"-tekst.
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            margin: "0 var(--space-3) var(--space-3)",
            background: "var(--color-brand-soft)",
            borderRadius: "var(--radius)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-brand-deep)",
            }}
          >
            Dit gesprek heeft de grens van {CHAT_CONVERSATION_CAP} berichten
            bereikt. Filly onthoudt wat 'ie hier heeft geleerd voor volgende
            gesprekken.
          </div>
          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading}
            className="ui-btn ui-btn--primary ui-btn--sm"
          >
            ＋ Nieuw gesprek starten
          </button>
        </div>
      ) : (
        <FillyChatInput
          value={input}
          loading={loading}
          sending={sending}
          canSend={!!conversationId}
          onChange={setInput}
          onSend={sendMsg}
        />
      )}

      {/* Per 2026-05-07: SuggestionDetailModal hier verwijderd. 'Bekijk
          versies →' navigeert nu naar /campagnes/voorstel/[id]. */}
    </div>
  );
}
