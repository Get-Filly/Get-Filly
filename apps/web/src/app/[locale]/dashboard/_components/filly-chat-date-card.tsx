"use client";

import { useState } from "react";
import type { DateChoiceCard } from "@/lib/api";

// ============================================================
// FillyChatDateCard, datum-keuze-vraag in chat (sinds 2026-05-24)
// ============================================================
//
// Wordt onder Filly's bericht getoond wanneer message_card.kind ===
// 'date_choice'. Snelle-keuze-knoppen + optionele datepicker. Bij
// klik op een knop stuurt de orchestrator een follow-up-tekst naar
// Filly ("Voor zaterdag" / "Voor Moederdag (10 mei)") zodat Filly
// het target meeneemt in zijn volgende beurt (kanaal-keuze of
// direct proposal).
//
// Submit-logica (in parent):
//   - Snelle keuze (vandaag/morgen/weekend) → label-tekst gebruiken
//   - Specifieke datum → date string in NL-formaat
//   - Lege/onbevestigde state → submit disabled
//
// Filly's brein hoofdstuk 7 (urgentie vs optimum) gebruikt de
// gekozen datum om te bepalen of een kanaal überhaupt op tijd is.
// ============================================================

export type DateChoiceState = "pending" | "chosen" | "submitting";

// Snelle-keuze-opties. Filly's filly-brain.config kent NL-feestdagen
// niet direct; we tonen daarom een vaste compacte set + een optie
// "specifieke datum" voor maatwerk.
type QuickOption = {
  key: string;
  label: string;
  hint: string;
  /** Wat we als follow-up tekst sturen naar Filly. */
  followUpText: string;
};

const QUICK_OPTIONS: QuickOption[] = [
  {
    key: "today",
    label: "Vandaag",
    hint: "Last-minute",
    followUpText: "Voor vandaag",
  },
  {
    key: "tomorrow",
    label: "Morgen",
    hint: "Korte aanloop",
    followUpText: "Voor morgen",
  },
  {
    key: "this_weekend",
    label: "Komend weekend",
    hint: "Zaterdag + zondag",
    followUpText: "Voor komend weekend",
  },
  {
    key: "next_week",
    label: "Volgende week",
    hint: "Hele week opties",
    followUpText: "Voor volgende week",
  },
];

type Props = {
  card: DateChoiceCard;
  state: DateChoiceState;
  onChoose: (followUpText: string) => void;
};

export function FillyChatDateCard({ card, state, onChoose }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [specificDate, setSpecificDate] = useState<string>("");
  const [mode, setMode] = useState<"quick" | "specific">("quick");

  const disabled = state !== "pending";

  // Disabled-state op de submit-knop: hangt af van mode.
  const canSubmit =
    !disabled &&
    ((mode === "quick" && selectedKey !== null) ||
      (mode === "specific" && specificDate.length > 0));

  // Bouwt de follow-up tekst die naar Filly gestuurd wordt.
  const buildFollowUpText = (): string | null => {
    if (mode === "quick" && selectedKey) {
      const opt = QUICK_OPTIONS.find((o) => o.key === selectedKey);
      return opt?.followUpText ?? null;
    }
    if (mode === "specific" && specificDate) {
      // Formatteer naar leesbare NL-datum ("Voor 10 mei 2026")
      // zodat Filly de context begrijpt.
      try {
        const d = new Date(specificDate);
        const label = d.toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        return `Voor ${label}`;
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleSubmit = () => {
    const text = buildFollowUpText();
    if (text) onChoose(text);
  };

  const buttonLabel =
    state === "submitting"
      ? "Filly denkt na…"
      : !canSubmit
        ? "Kies eerst een dag"
        : "Volgende stap";

  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        background: "var(--brand-soft, #EDF2EE)",
        border: "1px solid var(--brand, #1F4A2D)",
        borderRadius: 10,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{card.question}</div>

      {/* Tab-toggle tussen snelle keuze en specifieke datum */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 10,
          padding: 2,
          background: "white",
          borderRadius: 6,
          width: "fit-content",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("quick")}
          disabled={disabled}
          style={{
            background: mode === "quick" ? "var(--brand, #1F4A2D)" : "transparent",
            color: mode === "quick" ? "white" : "var(--text, #1a1a1a)",
            border: "none",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Snelle keuze
        </button>
        <button
          type="button"
          onClick={() => setMode("specific")}
          disabled={disabled}
          style={{
            background:
              mode === "specific" ? "var(--brand, #1F4A2D)" : "transparent",
            color: mode === "specific" ? "white" : "var(--text, #1a1a1a)",
            border: "none",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Specifieke datum
        </button>
      </div>

      {/* Snelle keuze: grid met 4 tegels */}
      {mode === "quick" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
          }}
        >
          {QUICK_OPTIONS.map((opt) => {
            const isSelected = selectedKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedKey(opt.key)}
                disabled={disabled}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: isSelected
                    ? "2px solid var(--brand, #1F4A2D)"
                    : "1px solid var(--border, #e5e5e5)",
                  background: isSelected ? "var(--brand, #1F4A2D)" : "white",
                  color: isSelected ? "white" : "var(--text, #1a1a1a)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ✓
                  </span>
                )}
                <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: isSelected
                      ? "rgba(255,255,255,0.85)"
                      : "var(--tl, #6B6F71)",
                    lineHeight: 1.3,
                  }}
                >
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Specifieke datum: native date-picker. Voor v2 mogelijk
          vervangen door eigen multi-select-datepicker. */}
      {mode === "specific" && (
        <div>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            disabled={disabled}
            min={new Date().toISOString().slice(0, 10)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 6,
              fontSize: 13,
              background: "white",
              color: "var(--text, #1a1a1a)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--tl, #6B6F71)",
              marginTop: 6,
              lineHeight: 1.3,
            }}
          >
            Datum waarop de campagne moet werken (bijv. de avond van een
            evenement of feestdag).
          </div>
        </div>
      )}

      {/* Verstuur-knop */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: canSubmit ? "var(--brand, #1F4A2D)" : "var(--border, #e5e5e5)",
            color: canSubmit ? "white" : "var(--tl, #9CA3AF)",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
