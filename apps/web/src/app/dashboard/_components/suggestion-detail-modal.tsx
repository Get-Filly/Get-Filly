"use client";

import { useEffect, useState } from "react";
import {
  approveSuggestion,
  refineSuggestion,
  selectSuggestionVariant,
  updateSuggestion,
  type AiSuggestion,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";

// ============================================================
// SuggestionDetailModal — detail + chat-edit voor een suggestie
// ============================================================
// Modal met twee kolommen (op brede schermen):
//   - Links: volledige campagne-inhoud (naam, onderwerp, body, impact)
//   - Rechts: chat-panel waar je met Filly kunt praten om aanpassingen
//     te vragen ("maak huiselijker", "andere foto", "korter").
//
// Iedere instruction-turn triggert een refine-call op de backend die
// Claude de campagne laat herschrijven. Nieuwe versie verschijnt
// direct links. Chat-geschiedenis is lokaal (geen DB-persist nodig
// voor v1; de data-log zit in ai_usage voor kosten-tracking).
//
// Acties onderin: Goedkeuren (maakt concept-campagne + sluit modal)
// of Afwijzen (markeer rejected + sluit).

type ChatTurn = {
  id: string;
  role: "user" | "filly" | "system";
  content: string;
};

export function SuggestionDetailModal({
  suggestion: initialSuggestion,
  onClose,
  onApproved,
  onRejected,
  onUpdated,
}: {
  suggestion: AiSuggestion;
  onClose: () => void;
  onApproved: (campaignId: string) => void;
  onRejected: (id: string) => void;
  onUpdated: (updated: AiSuggestion) => void;
}) {
  const [suggestion, setSuggestion] = useState(initialSuggestion);
  const [instruction, setInstruction] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "filly",
      content:
        "Vertel me wat je anders wil. Bv. 'maak het huiselijker', 'kortere onderwerpregel' of 'focus meer op families'.",
    },
  ]);
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape = sluiten.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !refining && !approving && !rejecting) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, refining, approving, rejecting]);

  const sc = suggestion.suggested_campaign ?? {};
  const type = sc.type ?? "mail";
  const typeLabel =
    type === "mail" ? "E-mail" : type === "social" ? "Social" : "WhatsApp";
  const name = sc.name ?? "Naamloos voorstel";

  // Multi-variant shape (nieuwste flow). Legacy single-body wordt
  // gepromoot tot 1-variant-array zodat de UI uniform is.
  const variants = Array.isArray(sc.variants) && sc.variants.length > 0
    ? sc.variants
    : [
        {
          subject_line: sc.subject_line ?? sc.subject,
          body: sc.body ?? sc.caption ?? "",
        },
      ];
  const selectedIndex =
    typeof sc.selected_index === "number" &&
    sc.selected_index >= 0 &&
    sc.selected_index < variants.length
      ? sc.selected_index
      : 0;

  const busy = refining || approving || rejecting;

  // Klik op een variant-kaart selecteert 'm. We slaan dat ook
  // server-side op zodat refine + approve op de juiste variant
  // werken (backend is bron van waarheid).
  const handleSelectVariant = async (index: number) => {
    if (busy || index === selectedIndex) return;
    try {
      const updated = await selectSuggestionVariant(suggestion.id, index);
      setSuggestion(updated);
      onUpdated(updated);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Variant-selectie mislukt.",
      );
    }
  };

  const sendInstruction = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInstruction("");
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setTurns((t) => [...t, userTurn]);
    setRefining(true);
    try {
      const updated = await refineSuggestion(suggestion.id, trimmed);
      setSuggestion(updated);
      onUpdated(updated);
      setTurns((t) => [
        ...t,
        {
          id: `f-${Date.now()}`,
          role: "filly",
          content: "Klaar. Je ziet de nieuwe versie hiernaast.",
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Aanpassen mislukt.";
      setTurns((t) => [
        ...t,
        { id: `err-${Date.now()}`, role: "system", content: msg },
      ]);
      setError(msg);
    } finally {
      setRefining(false);
    }
  };

  const handleApprove = async () => {
    if (busy) return;
    setApproving(true);
    setError(null);
    try {
      const { campaignId } = await approveSuggestion(suggestion.id);
      onApproved(campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Goedkeuren mislukt.");
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (busy) return;
    setRejecting(true);
    setError(null);
    try {
      await updateSuggestion(suggestion.id, "rejected");
      onRejected(suggestion.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Afwijzen mislukt.");
      setRejecting(false);
    }
  };

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--white, #FFFFFF)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 1000,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border, #E5DFD0)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--accent, #1F4A2D)",
                marginBottom: 4,
              }}
            >
              Voorstel bewerken · {typeLabel}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{name}</div>
          </div>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              color: "var(--tl)",
              cursor: busy ? "not-allowed" : "pointer",
              padding: 4,
            }}
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>

        {/* Body: twee kolommen — campagne-inhoud links, refine-chat rechts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Links: 3 variant-kaarten naast elkaar (op breed scherm)
              of onder elkaar (op smal). Geselecteerde variant heeft
              brand-rand + lichte highlight zodat duidelijk is welke
              gebruikt wordt bij approve/refine. */}
          <div
            style={{
              padding: 20,
              overflowY: "auto",
              borderRight: "1px solid var(--border, #E5DFD0)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--ts)",
                marginBottom: 8,
              }}
            >
              {variants.length === 1
                ? "Voorstel"
                : `Filly bedacht ${variants.length} versies — kies je favoriet`}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  variants.length === 1
                    ? "1fr"
                    : "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
                marginBottom: 16,
              }}
            >
              {variants.map((v, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectVariant(idx)}
                    disabled={busy}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: isSelected
                        ? "2px solid var(--accent, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                      background: isSelected
                        ? "var(--accent-light, #D6E0D8)"
                        : "var(--white, #FFFFFF)",
                      cursor: busy ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      // Vermijd dat een lange variant de modal verticaal
                      // uit balans haalt — vaste max-hoogte met scroll.
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: isSelected
                            ? "var(--accent, #1F4A2D)"
                            : "var(--tl)",
                        }}
                      >
                        Versie {idx + 1}
                      </span>
                      {isSelected && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--accent, #1F4A2D)",
                            padding: "1px 6px",
                            background: "var(--white, #FFFFFF)",
                            borderRadius: 999,
                            border: "1px solid var(--accent, #1F4A2D)",
                          }}
                        >
                          ✓ Gekozen
                        </span>
                      )}
                    </div>
                    {v.subject_line && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text)",
                        }}
                      >
                        {v.subject_line}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "var(--text)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {v.body || (
                        <em style={{ color: "var(--tl)" }}>Geen inhoud.</em>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {suggestion.reasoning && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--ts)",
                    marginTop: 12,
                    marginBottom: 4,
                  }}
                >
                  Waarom dit voorstel
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ts)",
                    lineHeight: 1.5,
                  }}
                >
                  {suggestion.reasoning}
                </div>
              </>
            )}
          </div>

          {/* Rechts: refine-chat */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--bg, #FAF7F1)",
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: "14px 16px 6px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent, #1F4A2D)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              ✨ Praat met Filly
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "6px 16px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {turns.map((t) => (
                <div
                  key={t.id}
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    padding: "8px 12px",
                    borderRadius: 8,
                    alignSelf:
                      t.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background:
                      t.role === "user"
                        ? "var(--accent, #1F4A2D)"
                        : t.role === "system"
                          ? "var(--red-soft, #fee)"
                          : "var(--white, #FFFFFF)",
                    color:
                      t.role === "user"
                        ? "white"
                        : t.role === "system"
                          ? "var(--red, #b00)"
                          : "var(--text)",
                    border:
                      t.role === "filly"
                        ? "1px solid var(--border, #E5DFD0)"
                        : "none",
                  }}
                >
                  {t.content}
                </div>
              ))}
              {refining && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 12,
                    color: "var(--tl)",
                    fontStyle: "italic",
                    padding: "4px 12px",
                  }}
                >
                  Filly past aan…
                </div>
              )}
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--border, #E5DFD0)",
                display: "flex",
                gap: 6,
                background: "var(--white, #FFFFFF)",
              }}
            >
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendInstruction();
                  }
                }}
                placeholder={
                  refining ? "Filly denkt na…" : "Hoe zou je het willen?"
                }
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={sendInstruction}
                disabled={!instruction.trim() || busy}
                style={{
                  padding: "6px 14px",
                  background: "var(--accent, #1F4A2D)",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor:
                    !instruction.trim() || busy ? "not-allowed" : "pointer",
                  opacity: !instruction.trim() || busy ? 0.5 : 1,
                }}
                aria-label="Verstuur"
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        {/* Footer met acties */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border, #E5DFD0)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          {error ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--red, #b00)",
                flex: 1,
              }}
            >
              {error}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--tl)" }}>
              Wijzigingen worden direct opgeslagen bij de suggestie.
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="secondary"
              onClick={handleReject}
              loading={rejecting}
              disabled={busy}
              style={{ color: "var(--color-danger)" }}
            >
              ✕ Afwijzen
            </Button>
            <Button
              variant="primary"
              onClick={handleApprove}
              loading={approving}
              disabled={busy}
            >
              ✓ Goedkeuren &amp; maak concept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
