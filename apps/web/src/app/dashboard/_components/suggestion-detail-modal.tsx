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
// SuggestionDetailModal, uitgebreide weergave + regenerate
// ============================================================
// Sinds 2026-05-06 single-column layout. De chat-edit-flow (rechter
// panel met "Praat met Filly") is verwijderd, vooral verwarring
// gaf (eigenaar dacht dat 'ie tegen Filly kon praten zoals in de
// dashboard-chat). Vervangen door één duidelijke 'Genereer nieuwe
// versies'-knop die 3 alternatieve varianten ophaalt via dezelfde
// refineSuggestion-API.
//
// Geen tijdstip-aanpassing: Filly heeft de actie-datum al gekozen op
// basis van bezetting + weer. Aanpassen daarvan zou de target-context
// breken.
//
// Acties onderin: Goedkeuren (maakt concept-campagne + sluit modal)
// of Afwijzen (markeer rejected + sluit).

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

  // Genereer 3 nieuwe varianten in andere tonen. Hergebruikt de
  // refineSuggestion-API met een vaste instructie zodat we geen extra
  // backend-endpoint nodig hebben. Filly krijgt opdracht om de eerdere
  // varianten als 'vermijd-lijst' te zien en 3 frisse alternatieven
  // te leveren.
  const handleRegenerate = async () => {
    if (busy) return;
    setError(null);
    setRefining(true);
    try {
      const updated = await refineSuggestion(
        suggestion.id,
        "Genereer 3 volledig nieuwe varianten met andere tonen en invalshoeken dan de huidige. Vermijd herhaling van de eerdere versies.",
      );
      setSuggestion(updated);
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Genereren mislukt.");
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

        {/* Body: single column sinds 2026-05-06, chat-edit-flow weg.
            Variant-kaarten + reasoning + regenerate-knop onder elkaar. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 20,
              overflowY: "auto",
              height: "100%",
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
                : `Filly bedacht ${variants.length} versies, kies je favoriet`}
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
                      // uit balans haalt, vaste max-hoogte met scroll.
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
                    color: "var(--ts)",
                    lineHeight: 1.6,
                  }}
                >
                  {suggestion.reasoning}
                </div>
              </>
            )}

            {/* Genereer-knop onder de varianten + reasoning. Hergebruikt
                de refineSuggestion-API met een vaste instructie. Filly
                bedenkt 3 nieuwe varianten in andere tonen. */}
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid var(--border, #E5DFD0)",
              }}
            >
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                loading={refining}
                disabled={busy}
              >
                {refining ? "Filly schrijft…" : "Genereer nieuwe versies"}
              </Button>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tl)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Niet helemaal je smaak? Filly schrijft drie nieuwe varianten
                in andere tonen. De datum laten we staan, die heeft Filly
                gekozen op basis van bezetting.
              </div>
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
            <div style={{ fontSize: 12, color: "var(--tl)" }} />
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
