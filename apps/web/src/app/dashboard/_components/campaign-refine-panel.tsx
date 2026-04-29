"use client";

import { useState } from "react";
import {
  generateCampaignVariants,
  updateCampaign,
} from "../../../lib/api";

// ============================================================
// CampaignRefinePanel — 3 alternatieven + AI-chat op concept
// ============================================================
// Inline paneel onder de "Inhoud"-card op /campagnes/[id]. Alleen
// zichtbaar bij status='concept'. Drie scenario's:
//   1. User klikt "Genereer 3 alternatieven" zonder instructie →
//      Filly maakt 3 varianten in verschillende tonen (warm/zakelijk/
//      speels) op basis van de huidige tekst.
//   2. User typt iets als "maak korter" en klikt → Filly maakt 3
//      versies richting die instructie.
//   3. User klikt op een variant → die wordt de nieuwe campagne-
//      tekst (auto-save via PATCH), andere 2 verdwijnen.
//
// Geen DB-state voor varianten — alleen ephemerale UI-state. Zo blijft
// het datamodel schoon: campagne is na save weer een snapshot.

type Variant = { subject_line?: string; body: string };

export function CampaignRefinePanel({
  campaignId,
  type,
  onApplied,
}: {
  campaignId: string;
  type: "mail" | "social" | "whatsapp";
  // Wordt aangeroepen na succesvol toepassen van een variant zodat
  // de parent-page de campagne kan refetchen voor verse content.
  onApplied: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (generating) return;
    setError(null);
    setGenerating(true);
    try {
      const { variants: result } = await generateCampaignVariants(
        campaignId,
        instruction.trim() || undefined,
      );
      setVariants(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Genereren mislukt. Probeer opnieuw.",
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
      });
      onApplied();
      // Varianten leegmaken — ze zijn "verbruikt" zodra je er één
      // koos. User kan opnieuw genereren als 'ie wil itereren.
      setVariants([]);
      setInstruction("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Toepassen mislukt. Probeer opnieuw.",
      );
    } finally {
      setApplyingIdx(null);
    }
  };

  const dismiss = () => {
    if (applyingIdx !== null) return;
    setVariants([]);
    setError(null);
  };

  return (
    <div
      className="card"
      style={{ marginBottom: 16 }}
    >
      <div className="card-h">
        <div>
          <div className="card-t">✨ Met Filly bewerken</div>
          <div className="card-st">
            Laat Filly 3 alternatieven schrijven, kies je favoriet.
          </div>
        </div>
      </div>
      <div className="card-b">
        {/* Input + generate-knop. Tekstveld is optioneel — zonder
            instructie krijgt user 3 algemene alternatieven. */}
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
              if (e.key === "Enter" && !generating) generate();
            }}
            placeholder="Optioneel: zeg wat je anders wil ('korter', 'speelser', 'focus op terras')..."
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
          <button
            onClick={generate}
            disabled={generating || applyingIdx !== null}
            className="btn-primary-dash"
            style={{ padding: "8px 14px", whiteSpace: "nowrap" }}
          >
            {generating
              ? "Filly bedenkt…"
              : variants.length > 0
                ? "↻ Opnieuw"
                : "✨ Genereer 3 alternatieven"}
          </button>
          {variants.length > 0 && (
            <button
              onClick={dismiss}
              disabled={applyingIdx !== null}
              style={{
                padding: "8px 12px",
                background: "transparent",
                color: "var(--ts)",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 6,
                fontSize: 13,
                cursor:
                  applyingIdx !== null ? "not-allowed" : "pointer",
              }}
            >
              Sluit
            </button>
          )}
        </div>

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

        {/* Loading-skelet zodat user weet dat er iets gebeurt — Claude
            kan tot ~5s nemen voor 3 varianten. */}
        {generating && variants.length === 0 && (
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
            Filly schrijft 3 alternatieve versies…
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
              Klik op een versie om 'm als nieuwe inhoud op te slaan.
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
                return (
                  <button
                    key={idx}
                    onClick={() => apply(idx)}
                    disabled={applyingIdx !== null}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border, #E5DFD0)",
                      background: isApplying
                        ? "var(--accent-light, #D6E0D8)"
                        : "var(--white, #FFFFFF)",
                      cursor:
                        applyingIdx !== null ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      opacity: isDisabled ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                    onMouseEnter={(e) => {
                      if (applyingIdx === null) {
                        e.currentTarget.style.borderColor =
                          "var(--accent, #1F4A2D)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--border, #E5DFD0)";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--accent, #1F4A2D)",
                      }}
                    >
                      {isApplying ? "Toepassen…" : `Versie ${idx + 1}`}
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
                      {v.body}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
