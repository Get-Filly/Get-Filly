"use client";

import { useEffect, useState } from "react";
import {
  fetchCampaignVariants,
  generateCampaignVariants,
  updateCampaign,
} from "../../../lib/api";

// ============================================================
// CampaignRefinePanel — 3 alternatieven + 1× extra + wisselen
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
//     wisselen tussen de varianten — preview-sectie volgt elke klik.
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
}) {
  const [instruction, setInstruction] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [canRegenerate, setCanRegenerate] = useState(true);
  const [regenCount, setRegenCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

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
      // Instruction-veld leegmaken — als user opnieuw wil itereren
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
      // Geen lokale reset nodig — parent unmount deze component
      // zodra de rerender variant_applied_at ziet.
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Toepassen mislukt. Probeer opnieuw.",
      );
    } finally {
      setApplyingIdx(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">✨ Met Filly bewerken</div>
          <div className="card-st">
            {regenCount === 0
              ? "Filly bedenkt 3 alternatieven; kies of laat 3 nieuwe maken."
              : regenCount === 1
                ? `${variants.length} versies — kies favoriet of laat 3 nieuwe maken.`
                : `${variants.length} versies — kies favoriet of bewerk handmatig.`}
          </div>
        </div>
      </div>
      <div className="card-b">
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
            <button
              onClick={regenerate}
              disabled={
                generating || applyingIdx !== null || bootstrapping
              }
              className="btn-primary-dash"
              style={{ padding: "8px 14px", whiteSpace: "nowrap" }}
            >
              {generating
                ? "Filly bedenkt…"
                : regenCount === 0
                  ? "✨ Genereer 3 alternatieven"
                  : "↻ Genereer 3 nieuwe"}
            </button>
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
                // Actieve variant = body matcht met campaign.body.
                // Trim om kleine whitespace-verschillen te negeren.
                const isActive =
                  currentBody !== null &&
                  v.body.trim() === currentBody.trim();
                return (
                  <button
                    key={idx}
                    onClick={() => apply(idx)}
                    disabled={applyingIdx !== null || generating}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: isActive
                        ? "2px solid var(--accent, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                      background: isApplying
                        ? "var(--accent-light, #D6E0D8)"
                        : isActive
                          ? "var(--accent-light, #D6E0D8)"
                          : "var(--white, #FFFFFF)",
                      cursor:
                        applyingIdx !== null || generating
                          ? "not-allowed"
                          : "pointer",
                      transition: "all 0.15s",
                      opacity: isDisabled ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 280,
                      overflowY: "auto",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (applyingIdx === null && !generating) {
                        e.currentTarget.style.borderColor =
                          "var(--accent, #1F4A2D)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isActive
                        ? "var(--accent, #1F4A2D)"
                        : "var(--border, #E5DFD0)";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--accent, #1F4A2D)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {isApplying
                        ? "Toepassen…"
                        : isActive
                          ? `✓ Versie ${idx + 1} (actief)`
                          : `Versie ${idx + 1}`}
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
