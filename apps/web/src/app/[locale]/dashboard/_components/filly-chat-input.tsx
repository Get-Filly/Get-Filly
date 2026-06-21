"use client";

import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================================
// FillyChatInput, meerregelige tekst-input + verzend-knop.
//
// Bewust een controlled component (waarde komt van de orchestrator)
// zodat we vanuit de orchestrator kunnen leeghalen na succesvolle
// verzending én de send-handler de actuele tekst ziet.
//
// Toetsenbord: Enter = versturen, Shift+Enter = nieuwe regel. De
// textarea groeit automatisch mee tot een max-hoogte (daarna scrollt
// 'ie intern) zodat langere berichten — event-details, opsommingen —
// gewoon passen.
//
// Drie disabled-condities tegelijk:
//   - loading      → initial chat-historie nog niet binnen
//   - sending      → vorig bericht is nog onderweg naar Filly
//   - !canSend     → geen actieve conversatie-id
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
  const t = useTranslations("dash__components_filly_chat_input");

  const disabled = loading || sending || !canSend;
  const placeholder = loading
    ? t("placeholderLoading")
    : sending
      ? t("placeholderSending")
      : t("placeholderIdle");

  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: hoogte resetten naar inhoud, gecapt op 120px. Loopt mee
  // met elke waarde-wijziging (ook leeghalen na verzending → terug
  // naar één regel).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <div className="chat-input">
      <div className="chat-iw">
        <textarea
          ref={taRef}
          className="chat-in"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter zonder Shift = versturen; Shift+Enter = nieuwe regel.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          className="chat-send"
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label={t("sendLabel")}
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
