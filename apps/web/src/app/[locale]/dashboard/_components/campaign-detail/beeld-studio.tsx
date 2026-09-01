"use client";

// ============================================================
// BeeldStudio, de Filly-beeldtool binnen de FotoCard
// ============================================================
//
// Drie standen op de HUIDIGE campagne-foto / -campagne:
//   1. verbeteren  -> POST image/enhance   (fotografen-polish)
//   2. aanpassen   -> POST image/edit      (instructie op de foto)
//   3. genereren   -> POST image/generate  (nieuwe foto uit tekst)
//
// De eigenaar kiest een variant (master) en plaatst 'm via de fan-out
// (POST image/apply-all) in het JUISTE formaat op ALLE kanalen van de
// campagne-bundel. Voor een losse campagne = plaatsen op dat ene kanaal.
//
// Feature-gated: de FotoCard toont deze studio alleen als de backend een
// GEMINI_API_KEY heeft (getCampaignImageStatus). Zonder key geen knop.
// ============================================================

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  enhanceCampaignImage,
  editCampaignImage,
  generateCampaignImage,
  applyAllCampaignImage,
  type CampaignImageVariant,
  type CampaignImageChannelResult,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

type Mode = "verbeteren" | "aanpassen" | "genereren";
type Step = "idle" | "creating" | "variants" | "placing" | "done";

type Props = {
  campaignId: string;
  // Heeft dit kanaal al een foto? Zo niet, dan kan alleen 'genereren'.
  hasPhoto: boolean;
  // Na plaatsen: nieuwe signed URL van het entree-kanaal, zodat de parent
  // de preview ververst en de bundel opnieuw laadt.
  onApplied: (signedUrl: string) => void;
  onClose: () => void;
};

export function BeeldStudio({
  campaignId,
  hasPhoto,
  onApplied,
  onClose,
}: Props) {
  const t = useTranslations("dash__components_campaign_detail_foto_card");
  const [mode, setMode] = useState<Mode>(hasPhoto ? "verbeteren" : "genereren");
  const [instruction, setInstruction] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1); // backend MAX_VARIANTS = 2
  const [step, setStep] = useState<Step>("idle");
  const [variants, setVariants] = useState<CampaignImageVariant[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [placed, setPlaced] = useState<CampaignImageChannelResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const effectiveMode: Mode = hasPhoto ? mode : "genereren";
  const busy = step === "creating" || step === "placing";

  const canRun =
    effectiveMode === "genereren"
      ? prompt.trim().length > 2
      : effectiveMode === "aanpassen"
        ? instruction.trim().length > 2
        : true; // verbeteren heeft geen extra invoer nodig

  const run = async () => {
    setError(null);
    setPicked(null);
    setStep("creating");
    try {
      const res =
        effectiveMode === "genereren"
          ? await generateCampaignImage(campaignId, prompt.trim(), count)
          : effectiveMode === "aanpassen"
            ? await editCampaignImage(campaignId, instruction.trim(), count)
            : await enhanceCampaignImage(campaignId, count);
      setVariants(res.variants);
      setStep("variants");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("studio.errors.createFailed"));
      setStep("idle");
    }
  };

  const placeAll = async () => {
    if (!picked) return;
    setError(null);
    setStep("placing");
    try {
      const { channels } = await applyAllCampaignImage(campaignId, picked);
      setPlaced(channels);
      setStep("done");
      // Entree-kanaal-resultaat -> nieuwe signed url voor de parent-preview.
      const entry =
        channels.find((c) => c.campaignId === campaignId && c.signed_url) ??
        channels.find((c) => c.signed_url);
      if (entry?.signed_url) onApplied(entry.signed_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("studio.errors.placeFailed"));
      setStep("variants");
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 8,
        padding: 14,
        background: "var(--bg-subtle, #FBF9F4)",
        maxHeight: 460,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ fontWeight: 700 }}>{t("studio.title")}</div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {t("studio.close")}
        </Button>
      </div>
      <div style={{ fontSize: 13, color: "var(--ts)", marginBottom: 12 }}>
        {t("studio.intro")}
      </div>

      {/* Standen-kiezer (verbeteren/aanpassen alleen met foto) */}
      {step !== "done" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["verbeteren", "aanpassen", "genereren"] as Mode[]).map((m) => {
            const disabled =
              (m === "verbeteren" || m === "aanpassen") && !hasPhoto;
            const active = effectiveMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={disabled || busy}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: disabled ? "not-allowed" : "pointer",
                  border: `1px solid ${active ? "var(--accent, #1F4A2D)" : "var(--border, #E5DFD0)"}`,
                  background: active
                    ? "rgba(31,74,45,0.08)"
                    : "var(--white, #fff)",
                  boxShadow: active
                    ? "0 0 0 1px var(--accent, #1F4A2D) inset"
                    : "none",
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {t(`studio.modes.${m}.title`)}
                </div>
                <div style={{ fontSize: 11, color: "var(--ts)", marginTop: 2 }}>
                  {t(`studio.modes.${m}.desc`)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Invoer per stand */}
      {step !== "done" && (
        <>
          {effectiveMode === "aanpassen" && (
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelSpan}>{t("studio.instructionLabel")}</span>
              <textarea
                rows={2}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={t("studio.instructionPlaceholder")}
                disabled={busy}
                style={inputStyle}
              />
            </label>
          )}
          {effectiveMode === "genereren" && (
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelSpan}>{t("studio.promptLabel")}</span>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("studio.promptPlaceholder")}
                disabled={busy}
                style={inputStyle}
              />
            </label>
          )}

          {/* Aantal varianten + hoofdactie */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ts)" }}>
                {t("studio.variantCount")}
              </span>
              {[1, 2].map((n) => (
                <Button
                  key={n}
                  variant={count === n ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCount(n)}
                  disabled={busy}
                >
                  {n}
                </Button>
              ))}
            </div>
            <Button
              variant="primary"
              onClick={run}
              disabled={!canRun || busy}
              loading={step === "creating"}
            >
              {effectiveMode === "verbeteren"
                ? t("studio.actions.enhance")
                : effectiveMode === "aanpassen"
                  ? t("studio.actions.edit")
                  : t("studio.actions.generate")}
            </Button>
          </div>
        </>
      )}

      {/* Varianten kiezen (blijft staan tijdens 'placing' zodat de knop een
          spinner kan tonen). */}
      {(step === "variants" || step === "placing") && variants.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: "var(--ts)", marginBottom: 8 }}>
            {t("studio.pickHint")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${variants.length}, 1fr)`,
              gap: 10,
            }}
          >
            {variants.map((v) => {
              const sel = picked === v.path;
              return (
                <button
                  key={v.path}
                  type="button"
                  onClick={() => setPicked(v.path)}
                  style={{
                    position: "relative",
                    padding: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: `2px solid ${sel ? "var(--accent, #1F4A2D)" : "transparent"}`,
                    background: "var(--bg, #FAF7F1)",
                    aspectRatio: "1 / 1",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.signed_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#fff",
                      background: "rgba(0,0,0,.55)",
                      padding: "2px 7px",
                      borderRadius: 999,
                    }}
                  >
                    {t("studio.aiLabel")}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button
              variant="primary"
              onClick={placeAll}
              disabled={!picked || busy}
              loading={step === "placing"}
            >
              {t("studio.placeAll")}
            </Button>
          </div>
        </div>
      )}

      {/* Resultaat per kanaal */}
      {step === "done" && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {t("studio.doneTitle")}
          </div>
          <div style={{ fontSize: 13, color: "var(--ts)", marginBottom: 10 }}>
            {t("studio.doneHint")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {placed.map((c) => (
              <div
                key={c.campaignId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                {c.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.signed_url}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--border, #E5DFD0)",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      border: "1px dashed var(--border, #E5DFD0)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.label}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        c.status === "failed"
                          ? "var(--color-danger, #B91C1C)"
                          : "var(--ts)",
                    }}
                  >
                    {c.aspectRatio} · {t(`studio.status.${c.status}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" onClick={onClose}>
              {t("studio.done")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--color-danger, #B91C1C)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const labelSpan: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: 8,
  padding: "9px 11px",
  font: "inherit",
  color: "var(--text)",
  background: "var(--white, #fff)",
  resize: "vertical",
};
