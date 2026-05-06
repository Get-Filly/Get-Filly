"use client";

import { Send } from "lucide-react";

// ============================================================
// FillyChatInput, text-input + verzend-knop voor de Filly-chat.
//
// Bewust een controlled component (waarde komt van de orchestrator)
// zodat we vanuit de orchestrator kunnen leeghalen na succesvolle
// verzending én de send-handler de actuele tekst ziet.
//
// Drie disabled-condities tegelijk:
//   - loading      → initial chat-historie nog niet binnen
//   - sending      → vorig bericht is nog onderweg naar Filly
//   - !canSend     → geen actieve conversatie-id (bv. nog geen
//                    restaurant gekoppeld)
// Placeholder past zich aan zodat de gebruiker ziet waarom de
// input niet bruikbaar is.
// ============================================================
export function FillyChatInput({
  value,
  loading,
  sending,
  canSend,
  onChange,
  onSend,
}: {
  value: string;
  loading: boolean;
  sending: boolean;
  canSend: boolean;
  onChange: (next: string) => void;
  onSend: () => void;
}) {
  const disabled = loading || sending || !canSend;
  const placeholder = loading
    ? "Chat laden…"
    : sending
      ? "Filly denkt na…"
      : "Vraag Filly iets...";

  return (
    <div className="chat-input">
      <div className="chat-iw">
        <input
          className="chat-in"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          className="chat-send"
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Verstuur"
        >
          {/* Lucide Send-icon i.p.v. unicode ↑. Schaalt scherp op
              alle DPRs en is brand-consistent met de rest van de
              UI-iconen. */}
          <Send size={16} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
