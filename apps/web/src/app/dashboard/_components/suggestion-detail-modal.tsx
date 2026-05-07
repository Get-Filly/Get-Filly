"use client";

import { useEffect, useState } from "react";
import {
  approveSuggestion,
  editSuggestionVariant,
  refineSuggestion,
  selectSuggestionVariant,
  setSuggestionScheduled,
  updateSuggestion,
  type AiSuggestion,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";

// ============================================================
// Date-utility helpers, gedeeld met campagne-edit panel-pattern
// ============================================================
// Filly's voorgestelde tijdstip leiden we af uit trigger_context
// .target_date plus een type-afhankelijke standaardtijd:
//   mail/whatsapp = 11:00 (lunch-bel-momentum)
//   social        = 17:00 (after-work attention-window)
// We doen dit in de browser-timezone zodat de eigenaar de tijd ziet
// die past bij z'n locatie (klanten zijn NL-only, dus Europe/Amsterdam
// in de praktijk).
function fillySuggestedIso(
  targetDate: string | undefined,
  type: "mail" | "social" | "whatsapp",
): string | null {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const hour = type === "social" ? 17 : 11;
  const [y, m, d] = targetDate.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

function formatDutchDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Naive-local-string voor <input type="datetime-local">.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Datums vergelijken op MINUUT-precisie. Seconden + ms negeren we
// omdat de datetime-local input alleen tot minuten gaat. Voorkomt
// vals-positieve waarschuwingen door ronding.
function timesEqualToMinute(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000)
  );
}

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
// Per 2026-05-07: tijdstip wél aanpasbaar. Filly stelt een tijd voor
// op basis van trigger_context.target_date + standaard-uur per type
// (mail/whatsapp 11:00, social 17:00). Eigenaar kan dat overschrijven
// via de datetime-input; bij afwijking verschijnt een rode waarschuwing
// 'Je wijkt af van Filly's voorstel'. Bij goedkeuring wordt de eigen
// keuze automatisch toegepast op de aangemaakte campagne.
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
  // Per 2026-05-07: na een 'Genereer nieuwe versies'-actie onthouden
  // we vanaf welke variant-index de set 'Nieuw' is. Indices ≥ deze
  // waarde krijgen een 'Nieuw'-label in de UI tot eigenaar erop klikt.
  // selected_index blijft staan zodat de oorspronkelijke keuze
  // ongewijzigd blijft, eigenaar moet bewust kiezen voor een nieuwe
  // versie. Null = geen recente regenerate, alle varianten 'normaal'.
  const [newVariantsFromIndex, setNewVariantsFromIndex] = useState<
    number | null
  >(null);
  // Per 2026-05-07: edit-mode voor de geselecteerde variant. Eigenaar
  // klikt 'Bewerk' → subject + body worden inputs → 'Opslaan' commit.
  // editingVariantIdx = welke index, null = niemand actief in edit.
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(
    null,
  );
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // Per 2026-05-07: schedule-edit-state in de modal. 'editingSchedule'
  // bepaalt of de datetime-input zichtbaar is, draftDatetime is de
  // working copy in datetime-local-formaat.
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftDatetime, setDraftDatetime] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape = sluiten.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !refining &&
        !approving &&
        !rejecting &&
        !savingSchedule
      ) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, refining, approving, rejecting, savingSchedule]);

  const sc = suggestion.suggested_campaign ?? {};
  const type = sc.type ?? "mail";
  const typeLabel =
    type === "mail" ? "E-mail" : type === "social" ? "Social" : "WhatsApp";
  const name = sc.name ?? "Naamloos voorstel";

  // Filly's voorgestelde tijd, afgeleid van trigger_context.target_date
  // + standaard-uur per type. Eigen-keuze (sc.scheduled_for) heeft
  // voorrang boven dit voorstel.
  const targetDate =
    typeof suggestion.trigger_context?.target_date === "string"
      ? (suggestion.trigger_context.target_date as string)
      : undefined;
  const fillyIso = fillySuggestedIso(targetDate, type);
  const customIso = sc.scheduled_for ?? null;
  const effectiveIso = customIso ?? fillyIso;
  const isCustom = !!customIso && !timesEqualToMinute(customIso, fillyIso);

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

  const busy =
    refining || approving || rejecting || savingSchedule || savingEdit;

  const handleStartEditVariant = (idx: number) => {
    if (busy) return;
    const v = variants[idx];
    setDraftSubject(v?.subject_line ?? "");
    setDraftBody(v?.body ?? "");
    setEditingVariantIdx(idx);
    setError(null);
  };

  const handleCancelEditVariant = () => {
    if (savingEdit) return;
    setEditingVariantIdx(null);
    setDraftSubject("");
    setDraftBody("");
  };

  const handleSaveEditVariant = async () => {
    if (editingVariantIdx === null || busy) return;
    if (!draftBody.trim()) {
      setError("Body mag niet leeg zijn.");
      return;
    }
    setError(null);
    setSavingEdit(true);
    try {
      const updated = await editSuggestionVariant(
        suggestion.id,
        editingVariantIdx,
        {
          // Mail = subject verplicht zichtbaar; social/whatsapp = wis
          // door null te sturen als 't input-veld leeg is.
          subject_line: draftSubject.trim() || null,
          body: draftBody.trim(),
        },
      );
      setSuggestion(updated);
      onUpdated(updated);
      setEditingVariantIdx(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bewerken mislukt.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartEditSchedule = () => {
    if (busy) return;
    setError(null);
    setDraftDatetime(
      toDatetimeLocalValue(effectiveIso ?? new Date().toISOString()),
    );
    setEditingSchedule(true);
  };

  const handleSaveSchedule = async () => {
    if (!draftDatetime || busy) return;
    setError(null);
    setSavingSchedule(true);
    try {
      const localIso = new Date(draftDatetime).toISOString();
      const updated = await setSuggestionScheduled(suggestion.id, localIso);
      setSuggestion(updated);
      onUpdated(updated);
      setEditingSchedule(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Verzendmoment opslaan mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleCancelEditSchedule = () => {
    if (savingSchedule) return;
    setEditingSchedule(false);
    setDraftDatetime("");
  };

  // 'Reset naar Filly' = gewoon scheduled_for op fillyIso terugzetten
  // (niet leegmaken, want backend kent geen 'wis'-status). Eigenaar
  // ziet daarna geen waarschuwing meer want custom == filly.
  const handleResetToFilly = async () => {
    if (!fillyIso || busy) return;
    setError(null);
    setSavingSchedule(true);
    try {
      const updated = await setSuggestionScheduled(suggestion.id, fillyIso);
      setSuggestion(updated);
      onUpdated(updated);
      setEditingSchedule(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Resetten naar Filly mislukt.",
      );
    } finally {
      setSavingSchedule(false);
    }
  };

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

  // Per 2026-05-07: 'Genereer nieuwe versies' triggert de backend om
  // 3 alternatieven te APPENDEN aan de variants-array (in plaats van
  // de geselecteerde te overschrijven). Frontend onthoudt vanaf welke
  // index de varianten 'Nieuw' zijn zodat we ze kunnen labelen.
  // selected_index blijft staan zodat de oorspronkelijke selectie
  // niet zomaar weggeklikt wordt; eigenaar moet zelf op een van de
  // nieuwe versies klikken om die over te nemen.
  const handleRegenerate = async () => {
    if (busy) return;
    setError(null);
    setRefining(true);
    try {
      const beforeCount = variants.length;
      const updated = await refineSuggestion(suggestion.id, "");
      setSuggestion(updated);
      onUpdated(updated);
      // Markeer alle indices ≥ beforeCount als 'Nieuw'. We gebruiken
      // de meest recente regenerate-grens, eerdere ronden zijn dus
      // niet meer 'Nieuw' (UX-keuze: alleen de meest verse 3 highlighten).
      setNewVariantsFromIndex(beforeCount);
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
            {/* Verzendmoment-sectie. Toont Filly's voorstel of de
                eigen keuze + waarschuwing als die afwijkt. Eigenaar
                kan vrij kiezen of terugzetten naar Filly's voorstel. */}
            {effectiveIso && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  background: "var(--bg, #FAF7F1)",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--ts)",
                    marginBottom: 6,
                  }}
                >
                  Verzendmoment
                </div>
                {editingSchedule ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <input
                      type="datetime-local"
                      value={draftDatetime}
                      onChange={(e) => setDraftDatetime(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid var(--border, #E5DFD0)",
                        borderRadius: 6,
                        fontSize: 14,
                        fontFamily: "inherit",
                        background: "var(--white, #FFFFFF)",
                        maxWidth: 280,
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        onClick={handleSaveSchedule}
                        disabled={!draftDatetime}
                        loading={savingSchedule}
                      >
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCancelEditSchedule}
                        disabled={savingSchedule}
                      >
                        Annuleren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--text)",
                        textTransform: "capitalize",
                        marginBottom: 4,
                      }}
                    >
                      {formatDutchDateTime(effectiveIso)}
                    </div>
                    {!isCustom && fillyIso && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--tl)",
                          fontStyle: "italic",
                          marginBottom: 8,
                        }}
                      >
                        Voorgesteld door Filly op basis van type campagne
                        en doelgroep.
                      </div>
                    )}
                    {isCustom && fillyIso && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#B91C1C",
                          background: "#FEF2F2",
                          border: "1px solid #FECACA",
                          padding: "6px 10px",
                          borderRadius: 6,
                          marginBottom: 8,
                          lineHeight: 1.4,
                        }}
                      >
                        Je wijkt af van Filly&rsquo;s voorstel (
                        {formatDutchDateTime(fillyIso)}).
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleStartEditSchedule}
                        disabled={busy}
                      >
                        ✎ Wijzig
                      </Button>
                      {isCustom && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleResetToFilly}
                          disabled={busy}
                          loading={savingSchedule}
                        >
                          ↺ Terug naar Filly&rsquo;s voorstel
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

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
                const isNew =
                  newVariantsFromIndex !== null &&
                  idx >= newVariantsFromIndex &&
                  !isSelected;
                const isEditing = editingVariantIdx === idx;
                const cardStyle: React.CSSProperties = {
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: isEditing
                    ? "2px solid var(--accent, #1F4A2D)"
                    : isSelected
                      ? "2px solid var(--accent, #1F4A2D)"
                      : isNew
                        ? "1.5px dashed var(--accent, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                  background: isSelected
                    ? "var(--accent-light, #D6E0D8)"
                    : "var(--white, #FFFFFF)",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: isEditing ? "none" : 280,
                  overflowY: isEditing ? "visible" : "auto",
                };

                // Edit-mode rendert als <div> met inputs binnenin (geen
                // button-wrapper, anders trigger elke klik op input een
                // select-variant). Read-mode blijft een button voor de
                // klikbare select-variant-actie.
                if (isEditing) {
                  return (
                    <div key={idx} style={cardStyle}>
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
                            color: "var(--accent, #1F4A2D)",
                          }}
                        >
                          Versie {idx + 1} bewerken
                        </span>
                      </div>
                      {/* Subject-line alleen invullen relevant voor mail.
                          Voor social/whatsapp wist 'm leeglaten. */}
                      {type === "mail" && (
                        <input
                          type="text"
                          value={draftSubject}
                          onChange={(e) => setDraftSubject(e.target.value)}
                          placeholder="Onderwerp"
                          maxLength={200}
                          style={{
                            padding: "8px 10px",
                            border: "1px solid var(--border, #E5DFD0)",
                            borderRadius: 6,
                            fontSize: 13,
                            fontFamily: "inherit",
                            background: "var(--white, #FFFFFF)",
                          }}
                        />
                      )}
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        placeholder="Bericht-inhoud"
                        maxLength={5000}
                        rows={6}
                        style={{
                          padding: "8px 10px",
                          border: "1px solid var(--border, #E5DFD0)",
                          borderRadius: 6,
                          fontSize: 13,
                          lineHeight: 1.5,
                          fontFamily: "inherit",
                          background: "var(--white, #FFFFFF)",
                          resize: "vertical",
                          minHeight: 100,
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <Button
                          size="sm"
                          onClick={handleSaveEditVariant}
                          loading={savingEdit}
                          disabled={busy && !savingEdit}
                        >
                          Opslaan
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleCancelEditVariant}
                          disabled={savingEdit}
                        >
                          Annuleren
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectVariant(idx)}
                    disabled={busy}
                    style={{
                      ...cardStyle,
                      cursor: busy ? "not-allowed" : "pointer",
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
                      <div style={{ display: "flex", gap: 6 }}>
                        {isNew && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--white, #FFFFFF)",
                              padding: "1px 6px",
                              background: "var(--accent, #1F4A2D)",
                              borderRadius: 999,
                            }}
                          >
                            Nieuw
                          </span>
                        )}
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
                        {/* Bewerk-knop alleen op de geselecteerde variant
                            zodat eigenaar eerst kiest welke versie de
                            basis is, dan bewerkt. Voorkomt verwarring
                            met meerdere parallelle bewerkingen. */}
                        {isSelected && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditVariant(idx);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleStartEditVariant(idx);
                              }
                            }}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--accent, #1F4A2D)",
                              padding: "1px 8px",
                              background: "var(--white, #FFFFFF)",
                              borderRadius: 999,
                              border: "1px solid var(--accent, #1F4A2D)",
                              cursor: busy ? "not-allowed" : "pointer",
                              opacity: busy ? 0.5 : 1,
                            }}
                          >
                            ✎ Bewerk
                          </span>
                        )}
                      </div>
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

            {/* Per 2026-05-07: 'Genereer nieuwe versies' append 3 nieuwe
                varianten aan de bestaande set. Cap = 6 totaal (init 3 +
                1 ronde van 3). Bij max bereikt → knop disabled, eigenaar
                kiest tussen wat er is. */}
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
                disabled={busy || variants.length >= 6}
              >
                {refining
                  ? "Filly schrijft…"
                  : variants.length >= 6
                    ? "Maximum aantal versies bereikt"
                    : "Genereer 3 nieuwe versies"}
              </Button>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tl)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                {variants.length >= 6
                  ? "Je hebt 6 versies, kies een variant of pas 'm handmatig aan."
                  : "Filly schrijft drie nieuwe varianten naast de bestaande. Klik op een versie om die over te nemen, het origineel blijft beschikbaar."}
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
