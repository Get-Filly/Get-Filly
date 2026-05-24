"use client";

import { useState } from "react";
import type { ChannelChoiceCard } from "../../../lib/api";

// ============================================================
// FillyChatChoiceCard, kanaal-keuze-vraag in chat (multi-select)
// ============================================================
//
// Wordt onder Filly's bericht getoond wanneer message_card.kind ===
// 'channel_choice'. Vijf checkboxes (Mail / Instagram / Facebook /
// WhatsApp / Google Business) + "Selecteer alles"-knop + Verstuur-knop.
// Eigenaar kan 1 of meerdere kanalen aanvinken, pas bij klik op
// Verstuur stuurt de orchestrator een follow-up-bericht naar Filly.
//
// Submit-logica (in parent):
//   - 1 single-kanaal aangevinkt        → FORMAAT 1 (single proposal)
//   - 2+ kanalen aangevinkt zonder GBP  → FORMAAT 2 (bundle mail+IG+FB)
//   - GBP samen met mail/IG/FB/WA       → split: bundle voor de
//                                          rest + apart single voor GBP
//                                          (bundle ondersteunt nog
//                                          geen GBP, zie
//                                          campaign-checks.toBundleChannel)
//   - 0 aangevinkt                       → Verstuur disabled
// ============================================================

export type ChoiceState = "pending" | "chosen" | "submitting";

// Instagram en Facebook zijn los aanvinkbaar (eigenaar kan alleen IG
// kiezen i.p.v. beide). Onder de motorkap mappen ze allebei op de
// 'social'-campaign-type bij FORMAAT 1; in een bundle gaan ze als
// 2 aparte sub-campagnes.
//
// google_business is multi-select-OK, maar de bundle-backend
// (approveBundleSuggestion) ondersteunt 'm nog niet. De orchestrator
// splitst GBP daarom apart af bij multi-select-submissions.
export type ChannelChoice =
  | "mail"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google_business";

type Props = {
  card: ChannelChoiceCard;
  state: ChoiceState;
  chosen?: ChannelChoice;
  onChoose: (choices: ChannelChoice[]) => void;
};

const OPTIONS: Array<{
  key: ChannelChoice;
  icon: string;
  label: string;
  hint: string;
}> = [
  { key: "mail", icon: "✉️", label: "Mail", hint: "Naar gastenlijst" },
  { key: "instagram", icon: "📷", label: "Instagram", hint: "IG-post" },
  { key: "facebook", icon: "📘", label: "Facebook", hint: "FB-post" },
  { key: "whatsapp", icon: "💬", label: "WhatsApp", hint: "Persoonlijk bericht" },
  // Google Business: post op je Google Business Profile (zichtbaar in
  // Maps + zoekresultaten). Voor horeca een ondergewaardeerd kanaal
  // qua bereik. Bundle-handling nog niet beschikbaar, dus splitten we
  // 'm af bij multi-select (zie comment hierboven).
  { key: "google_business", icon: "📍", label: "Google Business", hint: "Post op je profiel" },
];

export function FillyChatChoiceCard({
  card,
  state,
  onChoose,
}: Props) {
  // Multi-select state, alle 4 starten uitgevinkt zodat eigenaar
  // bewust een keuze maakt (geen accidentele submit-bij-default).
  const [selected, setSelected] = useState<Record<ChannelChoice, boolean>>({
    mail: false,
    instagram: false,
    facebook: false,
    whatsapp: false,
    google_business: false,
  });

  const disabled = state !== "pending";

  const toggle = (key: ChannelChoice) => {
    if (disabled) return;
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  };

  const allKeys: ChannelChoice[] = [
    "mail",
    "instagram",
    "facebook",
    "whatsapp",
    "google_business",
  ];
  const chosenList: ChannelChoice[] = allKeys.filter((c) => selected[c]);
  const chosenCount = chosenList.length;
  const allSelected = chosenCount === allKeys.length;

  // Toggle "Selecteer alles": als alle 4 al geselecteerd zijn → unselect
  // alles; anders → select alles. Snelle shortcut voor wanneer eigenaar
  // sowieso een bundle wil.
  const toggleAll = () => {
    if (disabled) return;
    const newValue = !allSelected;
    setSelected({
      mail: newValue,
      instagram: newValue,
      facebook: newValue,
      whatsapp: newValue,
      google_business: newValue,
    });
  };

  // Knop-label hangt af van de combinatie, geeft eigenaar voor klikken
  // duidelijkheid wat er gaat gebeuren.
  const buttonLabel =
    chosenCount === 0
      ? "Selecteer een optie"
      : chosenCount === 1
        ? "Verstuur"
        : `Verstuur (bundel ${chosenCount} kanalen)`;

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>{card.question}</div>
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          style={{
            background: "transparent",
            border: "1px solid var(--brand, #1F4A2D)",
            color: "var(--brand, #1F4A2D)",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {allSelected ? "Geen kiezen" : "Selecteer alles"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {OPTIONS.map((opt) => {
          const isSelected = selected[opt.key];
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              disabled={disabled}
              style={{
                padding: 12,
                borderRadius: 8,
                border: isSelected
                  ? "2px solid var(--brand, #1F4A2D)"
                  : "1px solid var(--border, #e5e5e5)",
                background: isSelected
                  ? "var(--brand, #1F4A2D)"
                  : "white",
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
              {/* Visuele check rechtsboven bij selectie */}
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
              <div style={{ fontSize: 18 }}>{opt.icon}</div>
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

      {/* Verstuur-knop */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => chosenCount > 0 && onChoose(chosenList)}
          disabled={disabled || chosenCount === 0}
          style={{
            width: "100%",
            padding: "10px 14px",
            background:
              disabled || chosenCount === 0
                ? "var(--border, #e5e5e5)"
                : "var(--brand, #1F4A2D)",
            color:
              disabled || chosenCount === 0
                ? "var(--tl, #9CA3AF)"
                : "white",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor:
              disabled || chosenCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          {state === "submitting" ? "Filly bedenkt…" : buttonLabel}
        </button>
      </div>
    </div>
  );
}
