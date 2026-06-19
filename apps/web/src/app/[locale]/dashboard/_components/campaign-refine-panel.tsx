"use client";

import { useEffect, useState } from "react";
import {
  fetchCampaignVariants,
  generateCampaignVariants,
  updateCampaign,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ============================================================
// CampaignRefinePanel, 3 alternatieven + 1× extra + wisselen
// ============================================================
// Inline paneel onder de "Inhoud"-card op /campagnes/[id]. Alleen
// zichtbaar bij status='concept'.
//
// Gedrag:
//   - Bij eerste open van detail-page (cache leeg): genereer
//     automatisch 3 alternatieven en cache ze in de DB.
//   - Bij her-bezoek: tonen wat al gecached is, géén Claude-call.
//   - Knop "Genereer 3 nieuwe": voegt 3 extra toe (totaal 6).
//   - Daarna disabled: je hebt 6 versies, kies of bewerk handmatig.
//   - Klik op een variant → body wordt geüpdatet (from_variant=true
//     zodat de cache NIET wordt gewist). Eigenaar kan vrij blijven
//     wisselen tussen de varianten, preview-sectie volgt elke klik.
//   - Actieve variant krijgt een ✓-highlight zodat duidelijk is
//     welke nu in de uiting-preview staat.
//
// Kostenbeheersing: max 2 Claude-generaties per campagne (= 6
// alternatieven), daarna alleen wisselen tussen bestaande.

type Variant = { subject_line?: string; body: string };

export function CampaignRefinePanel({
  campaignId,
  type,
  currentBody,
  onApplied,
  embedded = false,
}: {
  campaignId: string;
  type: "mail" | "social" | "whatsapp";
  // Huidige body op de campagne. Gebruikt om te markeren welke
  // variant nu de actieve preview-content is. Null als de campagne
  // nog geen body heeft.
  currentBody: string | null;
  // Wordt aangeroepen na succesvol toepassen van een variant zodat
  // de parent-page de campagne kan refetchen voor verse content.
  onApplied: () => void;
  // Per 2026-05-12: embedded-mode laat de buitenste card-wrapper
  // weg zodat dit paneel binnen een andere card gerenderd kan worden
  // (bv. de "Inhoud"-card op /campagnes/[id] zodat variants + Genereer
  // visueel identiek zijn aan de voorstel-detail-layout).
  embedded?: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [canRegenerate, setCanRegenerate] = useState(true);
  const [regenCount, setRegenCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Per 2026-05-12: inline edit-flow per variant. Eigenaar klikt
  // "✎ Bewerk" rechtsbovenin op een variant → die variant verandert
  // in een form (subject + body), klik op Opslaan → updateCampaign
  // met de nieuwe tekst + from_variant=true. Variant in lokale state
  // bijwerken zodat de UI direct de nieuwe tekst toont zonder refetch.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (idx: number) => {
    const v = variants[idx];
    if (!v) return;
    setError(null);
    setDraftSubject(v.subject_line ?? "");
    setDraftBody(v.body ?? "");
    setEditingIdx(idx);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setDraftSubject("");
    setDraftBody("");
  };

  const saveEdit = async () => {
    if (editingIdx === null) return;
    setSavingEdit(true);
    setError(null);
    try {
      await updateCampaign(campaignId, {
        subject_line: type === "mail" ? draftSubject : undefined,
        body: draftBody,
        from_variant: true,
      });
      // Variant in lokale state updaten zodat de grid direct de
      // nieuwe tekst toont.
      setVariants((prev) =>
        prev.map((v, i) =>
          i === editingIdx
            ? { subject_line: draftSubject, body: draftBody }
            : v,
        ),
      );
      onApplied();
      setEditingIdx(null);
      setDraftSubject("");
      setDraftBody("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Bewerken mislukt. Probeer opnieuw.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Bootstrap: bij mount eerst kijken of er al een gecachte set staat.
  // Zo ja → tonen. Zo nee → automatisch genereren (eerste 3). Dit
  // gebeurt eenmalig per page-load; her-bezoek triggert geen nieuwe
  // Claude-call.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cache = await fetchCampaignVariants(campaignId);
        if (cancelled) return;
        if (cache.variants.length > 0) {
          setVariants(cache.variants);
          setRegenCount(cache.regenerate_count);
          setCanRegenerate(cache.can_regenerate);
          setBootstrapping(false);
          return;
        }
        // Cache leeg → auto-genereer 3 zodat user direct iets ziet.
        setGenerating(true);
        setBootstrapping(false);
        const fresh = await generateCampaignVariants(campaignId);
        if (cancelled) return;
        setVariants(fresh.variants);
        setRegenCount(fresh.regenerate_count);
        setCanRegenerate(fresh.can_regenerate);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Kon alternatieven niet laden. Herlaad de pagina.",
        );
      } finally {
        if (!cancelled) {
          setGenerating(false);
          setBootstrapping(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const regenerate = async () => {
    if (generating || !canRegenerate) return;
    setError(null);
    setGenerating(true);
    try {
      const result = await generateCampaignVariants(
        campaignId,
        instruction.trim() || undefined,
      );
      setVariants(result.variants);
      setRegenCount(result.regenerate_count);
      setCanRegenerate(result.can_regenerate);
      // Instruction-veld leegmaken, als user opnieuw wil itereren
      // (volgens body-edit-flow) is dat een andere ronde.
      setInstruction("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Genereren mislukt. Probeer opnieuw.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const apply = async (idx: number) => {
    const variant = variants[idx];
    if (!variant || applyingIdx !== null) return;
    setError(null);
    setApplyingIdx(idx);
    try {
      await updateCampaign(campaignId, {
        // Onderwerp alleen voor mail; voor social/whatsapp heeft het
        // geen betekenis (negeren = backend laat ongewijzigd).
        subject_line: type === "mail" ? variant.subject_line ?? "" : undefined,
        body: variant.body,
        // Markeer als variant-apply: backend zet variant_applied_at,
        // detail-pagina rerendert en verbergt deze sectie volledig.
        from_variant: true,
      });
      onApplied();
      // Geen lokale reset nodig, parent unmount deze component
      // zodra de rerender variant_applied_at ziet.
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Toepassen mislukt. Probeer opnieuw.",
      );
    } finally {
      setApplyingIdx(null);
    }
  };

  // Body-renderer: alle interactie (input, regenerate-knop, variants,
  // error/loading) blijft hetzelfde tussen card-mode en embedded-mode.
  // Alleen de buitenste card-wrapper verschilt.
  const body = (
    <>
{/* >>> body-start */}
        {/* Input + regenerate-knop. Het tekstveld is alléén relevant
            voor de "+3 nieuwe"-klik (instructie geeft Filly richting).
            Eerste set is altijd zonder instructie. */}
        {canRegenerate && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
              marginBottom: 12,
            }}
          >
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !generating) regenerate();
              }}
              placeholder={
                regenCount === 0
                  ? "Optioneel: zeg wat je anders wil voordat je opnieuw genereert..."
                  : "Optioneel: 'korter', 'speelser', 'focus op terras'..."
              }
              disabled={generating || applyingIdx !== null}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "inherit",
                background: "var(--white, #FFFFFF)",
              }}
            />
            <Button
              onClick={regenerate}
              loading={generating}
              disabled={applyingIdx !== null || bootstrapping}
              style={{ whiteSpace: "nowrap" }}
            >
              {regenCount === 0
                ? "✨ Genereer 3 alternatieven"
                : "↻ Genereer 3 nieuwe"}
            </Button>
          </div>
        )}

        {!canRegenerate && variants.length > 0 && (
          <div
            style={{
              padding: "8px 12px",
              background: "var(--surface, #EFE8D8)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--ts)",
              marginBottom: 12,
            }}
          >
            Maximum aantal generaties bereikt (3 + 3 = 6 versies). Kies
            er één of bewerk handmatig via "✎ Bewerken" rechtsboven.
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "8px 12px",
              background: "var(--red-soft, #fee)",
              color: "var(--red, #b00)",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading-skelet bij initiële generatie. */}
        {(bootstrapping || (generating && variants.length === 0)) && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--tl)",
              border: "1px dashed var(--border, #E5DFD0)",
              borderRadius: 8,
              fontStyle: "italic",
            }}
          >
            {bootstrapping
              ? "Bezig met laden…"
              : "Filly schrijft 3 alternatieve versies…"}
          </div>
        )}

        {variants.length > 0 && (
          <>
            <div
              style={{
                fontSize: 12,
                color: "var(--ts)",
                marginBottom: 8,
              }}
            >
              Klik op een versie om 'm in de uiting-preview te zetten.
              Wisselen kan zoveel je wilt.
              {regenCount === 1 && canRegenerate && (
                <span> Filly kan nog 3 nieuwe maken (max 6 totaal).</span>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 10,
              }}
            >
              {variants.map((v, idx) => {
                const isApplying = applyingIdx === idx;
                const isDisabled = applyingIdx !== null && !isApplying;
                const isActive =
                  typeof currentBody === "string" &&
                  typeof v.body === "string" &&
                  v.body.trim() === currentBody.trim();
                const isEditing = editingIdx === idx;
                const cardStyle: React.CSSProperties = {
                  padding: "14px 16px",
                  borderRadius: 8,
                  border:
                    isEditing || isActive
                      ? "2px solid var(--accent, #1F4A2D)"
                      : "1px solid var(--border, #E5DFD0)",
                  background:
                    isApplying || isActive
                      ? "var(--accent-light, #D6E0D8)"
                      : "var(--white, #FFFFFF)",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                };

                // Edit-mode: variant wordt een form (subject + body)
                if (isEditing) {
                  return (
                    <div key={idx} style={cardStyle}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--accent, #1F4A2D)",
                        }}
                      >
                        Versie {idx + 1} bewerken
                      </div>
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
                        rows={8}
                        style={{
                          padding: "8px 10px",
                          border: "1px solid var(--border, #E5DFD0)",
                          borderRadius: 6,
                          fontSize: 13,
                          lineHeight: 1.55,
                          fontFamily: "inherit",
                          background: "var(--white, #FFFFFF)",
                          resize: "vertical",
                          minHeight: 140,
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          loading={savingEdit}
                          disabled={!draftBody.trim()}
                        >
                          Opslaan
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          Annuleren
                        </Button>
                      </div>
                    </div>
                  );
                }

                // Display-mode: klikbaar om te selecteren + Bewerk-knop
                return (
                  <div
                    key={idx}
                    style={{
                      ...cardStyle,
                      cursor:
                        applyingIdx !== null || generating
                          ? "not-allowed"
                          : "pointer",
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                    onClick={() => {
                      if (applyingIdx === null && !generating && !isActive) {
                        apply(idx);
                      }
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
                          color: isActive
                            ? "var(--accent, #1F4A2D)"
                            : "var(--tl)",
                        }}
                      >
                        Versie {idx + 1}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {isApplying && (
                          <span
                            style={{
                              fontSize: 10,
                              fontStyle: "italic",
                              color: "var(--tl)",
                            }}
                          >
                            Toepassen…
                          </span>
                        )}
                        {isActive && !isApplying && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--accent, #1F4A2D)",
                              padding: "1px 6px",
                              background: "var(--white, #FFFFFF)",
                              borderRadius: 999,
                              border:
                                "1px solid var(--accent, #1F4A2D)",
                            }}
                          >
                            ✓ Gekozen
                          </span>
                        )}
                        {!isApplying && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (applyingIdx === null && !generating) {
                                startEdit(idx);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (applyingIdx === null && !generating) {
                                  startEdit(idx);
                                }
                              }
                            }}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--accent, #1F4A2D)",
                              padding: "1px 8px",
                              background: "var(--white, #FFFFFF)",
                              borderRadius: 999,
                              border:
                                "1px solid var(--accent, #1F4A2D)",
                              cursor:
                                applyingIdx !== null || generating
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                applyingIdx !== null || generating
                                  ? 0.5
                                  : 1,
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
                          fontSize: 13,
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
                      {v.body ?? ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
{/* >>> body-end */}
    </>
  );

  // Embedded-mode: render alleen de body. De parent (bv. de Inhoud-
  // card op /campagnes/[id]) zorgt voor het card-frame.
  if (embedded) {
    return body;
  }

  // Standalone-mode: eigen card-wrapper met titel + subtitle.
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">✨ Met Filly bewerken</div>
          <div className="card-st">
            {regenCount === 0
              ? "Filly bedenkt 3 alternatieven; kies of laat 3 nieuwe maken."
              : regenCount === 1
                ? `${variants.length} versies, kies favoriet of laat 3 nieuwe maken.`
                : `${variants.length} versies, kies favoriet of bewerk handmatig.`}
          </div>
        </div>
      </div>
      <div className="card-b">{body}</div>
    </div>
  );
}
