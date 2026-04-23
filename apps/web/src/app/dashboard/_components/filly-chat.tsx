"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchActiveChat,
  sendChatMessage,
  type ChatMessage,
} from "../../../lib/api";

// De backend geeft messages terug in het nette role-format
// ('filly' | 'user' | 'system'). We renderen 'system' voorlopig
// niet zichtbaar — het is gereserveerd voor latere notificaties
// die we in de thread willen tonen.

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bij mount: haal de actieve chat binnen. Backend maakt 'm aan bij
  // eerste bezoek (incl. welkomstbericht) zodat we nooit een lege
  // state hoeven te renderen.
  useEffect(() => {
    fetchActiveChat()
      .then((data) => {
        setConversationId(data.conversationId);
        setMessages(data.messages);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError("Kon de chat niet laden. Probeer te verversen.");
        setLoading(false);
      });
  }, []);

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
