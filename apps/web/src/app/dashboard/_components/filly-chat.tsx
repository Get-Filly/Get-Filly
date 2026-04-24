"use client";

import { useEffect, useRef, useState } from "react";
import {
  approveSuggestion,
  fetchActiveChat,
  sendChatMessage,
  type ChatMessage,
  type CampaignProposalCard,
} from "../../../lib/api";
import { useRestaurant } from "../../../lib/restaurant-context";

// De backend geeft messages terug in het nette role-format
// ('filly' | 'user' | 'system'). We renderen 'system' voorlopig
// niet zichtbaar — het is gereserveerd voor latere notificaties
// die we in de thread willen tonen.
//
// Sommige Filly-berichten dragen een `message_card`. Voor v1 is dat
// alleen `campaign_proposal`: Filly heeft een concrete campagne
// bedacht en vraagt de eigenaar of hij 'm als concept mag opslaan.
// Per proposal houden we een lokale status bij zodat de UI kan laten
// zien of de user al heeft geklikt (maken/afwijzen) en wat het
// resultaat was.

type ProposalStatus =
  | { state: "pending" }
  | { state: "creating" }
  | { state: "created"; campaignId: string }
  | { state: "dismissed" }
  | { state: "error"; message: string };

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
  // Status per proposal-kaart. Keyen op messageId want elke Filly-
  // bericht kan max één proposal hebben.
  const [proposalStatus, setProposalStatus] = useState<
    Record<string, ProposalStatus>
  >({});
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
      setError("Nog geen restaurant actief — chat is pas beschikbaar na onboarding.");
      return;
    }

    let cancelled = false;
    fetchActiveChat()
      .then((data) => {
        if (cancelled) return;
        setConversationId(data.conversationId);
        setMessages(data.messages);
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
                    <ProposalCard
                      proposal={m.message_card}
                      status={proposalStatus[m.id] ?? { state: "pending" }}
                      onAccept={() => acceptProposal(m.id, m.message_card as CampaignProposalCard)}
                      onDismiss={() => dismissProposal(m.id)}
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

      {error && (
        <div
          style={{
            padding: "8px 12px",
            margin: "0 12px 8px",
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div className="chat-input">
        <div className="chat-iw">
          <input
            className="chat-in"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMsg();
            }}
            placeholder={
              loading
                ? "Chat laden…"
                : sending
                  ? "Filly denkt na…"
                  : "Vraag Filly iets..."
            }
            disabled={loading || sending || !conversationId}
          />
          <button
            className="chat-send"
            onClick={sendMsg}
            disabled={!input.trim() || loading || sending || !conversationId}
            aria-label="Verstuur"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ProposalCard — inline kaartje onder een Filly-bericht dat een
// campagne voorstelt. Toont type + titel + (bij mail) onderwerp +
// 2 knoppen: aanmaken of afwijzen. Na klik verandert de UI naar
// "creating"/"created"/"dismissed"/"error". De volledige body van
// de campagne tonen we bewust NIET opnieuw — die staat al in het
// Filly-bericht erboven.
// ============================================================
function ProposalCard({
  proposal,
  status,
  onAccept,
  onDismiss,
}: {
  proposal: CampaignProposalCard;
  status: ProposalStatus;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const typeLabel =
    proposal.type === "mail"
      ? "E-mail"
      : proposal.type === "social"
        ? "Social"
        : "WhatsApp";

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
        <span>Campagne-voorstel</span>
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
      {proposal.subject_line && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            marginBottom: 4,
          }}
        >
          Onderwerp: {proposal.subject_line}
        </div>
      )}

      {status.state === "pending" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
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
            Ja, maak aan als concept
          </button>
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
            Nee, bedankt
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
          Aanmaken…
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
          Concept aangemaakt.{" "}
          <a
            href={`/dashboard/campagnes/${status.campaignId}`}
            style={{
              color: "var(--accent, #1F4A2D)",
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            Bekijken →
          </a>
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
          Voorstel afgewezen.
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
            Opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}
