"use client";

import { useEffect, useRef, useState } from "react";

type CampaignProposal = {
  title: string;
  body: string;
};

type Message =
  | { id: string; role: "ai"; text: React.ReactNode; card?: CampaignProposal; status?: string }
  | { id: string; role: "user"; text: string };

const initialMessages: Message[] = [
  {
    id: "m1",
    role: "ai",
    text: (
      <>
        Goedemorgen! Ik zie dat <strong>donderdag op 38%</strong> staat en er
        regen verwacht wordt. Wil je dat ik een campagne opstel?
      </>
    ),
    card: {
      title: "📩 Chef's Lunch — do 17 apr",
      body: "3-gangen voor €24,50 · Mail naar 248 gasten · Verwachting: +22% bezetting",
    },
  },
  { id: "m2", role: "user", text: "Ziet er goed uit. Verstuur maar!" },
  {
    id: "m3",
    role: "ai",
    text: "Ik hou de open-rate bij en geef je vanavond een update.",
    status: "✓ Chef's Lunch goedgekeurd — mail om 10:00",
  },
];

let idCounter = 100;
const nextId = () => `m${++idCounter}`;

export function FillyChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const sendMsg = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { id: nextId(), role: "user", text }]);
    setInput("");
    setTyping(true);
    // Mock-antwoord. Later vervangen door echte Claude API call via backend.
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "ai",
          text: "Ik noteer het. Zodra de backend gekoppeld is, antwoord ik met echte data.",
        },
      ]);
    }, 1200);
  };

  const approveCard = () => {
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "ai",
        text: "Top, ik plan de mail in voor morgenochtend 10:00.",
        status: "✓ Campagne ingepland",
      },
    ]);
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
        {messages.map((m) =>
          m.role === "ai" ? (
            <div key={m.id} className="msg msg-ai">
              <div className="msg-lbl">Filly AI</div>
              {m.status && <div className="msg-status">{m.status}</div>}
              <div>{m.text}</div>
              {m.card && (
                <div className="msg-card">
                  <div className="mc-title">{m.card.title}</div>
                  <div className="mc-body">{m.card.body}</div>
                  <div className="mc-actions">
                    <button className="mc-btn p" onClick={approveCard}>
                      Goedkeuren
                    </button>
                    <button className="mc-btn">Aanpassen</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="msg msg-user">
              <div className="msg-lbl">Jij</div>
              {m.text}
            </div>
          ),
        )}
        {typing && (
          <div className="typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
      </div>

      <div className="chat-input">
        <div className="chat-iw">
          <input
            className="chat-in"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMsg();
            }}
            placeholder="Vraag Filly iets..."
          />
          <button
            className="chat-send"
            onClick={sendMsg}
            disabled={!input.trim()}
            aria-label="Verstuur"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
