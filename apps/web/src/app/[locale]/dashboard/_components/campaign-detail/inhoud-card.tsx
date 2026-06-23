"use client";

// ============================================================
// InhoudCard, Gekozen versie + alternatieven naast elkaar
// ============================================================
//
// Per 2026-05-13 (iteratie 2): op verzoek van Floris werken
// alternatieven nu zo:
//
//   ┌─ Gekozen versie (groot, met Bewerk + ✕ terug) ──┐
//   │ Versie N                                        │
//   │ Volle tekst…                                    │
//   └─────────────────────────────────────────────────┘
//   [ ✨ Genereer 3 nieuwe versies ]  (in canEdit)
//
//   ANDERE VERSIES
//   ┌ Versie X ────┐  ┌ Versie Y ────┐  ┌ Versie Z ────┐
//   │ Volle tekst  │  │ Volle tekst  │  │ Volle tekst  │
//   └──────────────┘  └──────────────┘  └──────────────┘
//
// Klik op een alternatief = wordt direct Gekozen (selectVariant).
// De vorige Gekozen schuift naar de alternatieven-rij.
//
// Op de Gekozen-card verschijnt een ✕-knop zodra de selectie
// afwijkt van de versie die bij page-open zichtbaar was. Klik ✕
// = terug naar die 'originele' variant. Geen drift, eigenaar
// kan altijd terug.
//
// Bewerken: alleen de Gekozen versie is bewerkbaar. Eigenaar
// heeft daardoor altijd 1 actuele tekst die downstream-systemen
// (mail-send, social-publish) gebruiken.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type InhoudVariant = {
  // Per 2026-05-13: null toegestaan zodat de unified-page
  // (CampaignVariant uit lib/api) hetzelfde shape kan doorgeven
  // zonder mapping-stap.
  subject_line?: string | null;
  body?: string;
};

type Props = {
  // Scroll-target voor jump-to-fix vanuit Missende aspecten.
  sectionId?: string;
  variants: InhoudVariant[];
  selectedIndex: number;
  // 'mail' toont onderwerp-veld in edit-modus; social/whatsapp niet.
  type: "mail" | "social" | "whatsapp";
  // canEdit = mogen Bewerk / Genereer / klik-alternatief / ✕-terug
  // actief zijn? Op voorstel/concept: true. Op ingepland/actief: false.
  canEdit: boolean;
  // busy = parent doet een andere actie; alle interactieve elementen
  // disablen om dubbel-calls te vermijden.
  busy: boolean;
  // Edit-state (parent owned)
  editingVariantIdx: number | null;
  draftSubject: string;
  draftBody: string;
  savingEdit: boolean;
  refining: boolean;
  // Callbacks
  onSelectVariant: (idx: number) => void;
  onStartEditVariant: (idx: number) => void;
  onCancelEditVariant: () => void;
  onSaveEditVariant: () => void;
  onDraftSubjectChange: (val: string) => void;
  onDraftBodyChange: (val: string) => void;
  onRegenerate: () => void;
};

export function InhoudCard({
  sectionId,
  variants,
  selectedIndex,
  type,
  canEdit,
  busy,
  editingVariantIdx,
  draftSubject,
  draftBody,
  savingEdit,
  refining,
  onSelectVariant,
  onStartEditVariant,
  onCancelEditVariant,
  onSaveEditVariant,
  onDraftSubjectChange,
  onDraftBodyChange,
  onRegenerate,
}: Props) {
  const t = useTranslations(
    "dash__components_campaign_detail_inhoud_card",
  );
  // 'Originele' variant = de selectedIndex die we zagen bij de
  // eerste render van deze campagne. Daarmee kan de ✕-knop altijd
  // terug-flippen naar de versie die de eigenaar zag bij binnenkomst.
  // useRef i.p.v. state: 't is een stabiele anker, geen render-trigger.
  const originalIdxRef = useRef<number | null>(null);
  useEffect(() => {
    if (originalIdxRef.current === null && variants.length > 0) {
      originalIdxRef.current = Math.min(
        Math.max(selectedIndex, 0),
        variants.length - 1,
      );
    }
  }, [variants.length, selectedIndex]);

  const safeSelected = Math.min(
    Math.max(selectedIndex, 0),
    Math.max(variants.length - 1, 0),
  );
  const selected = variants[safeSelected];
  const alternatives = variants
    .map((v, idx) => ({ v, idx }))
    .filter((x) => x.idx !== safeSelected);

  const editingSelected = editingVariantIdx === safeSelected;
  const canRevertToOriginal =
    canEdit &&
    originalIdxRef.current !== null &&
    originalIdxRef.current !== safeSelected;

  const handleRevert = () => {
    if (!canRevertToOriginal || busy) return;
    onSelectVariant(originalIdxRef.current!);
  };

  return (
    <div
      id={sectionId}
      className="card"
      style={{ marginBottom: 16, scrollMarginTop: 120 }}
    >
      <div className="card-h">
        <div>
          <div className="card-t">{t("title")}</div>
        </div>
      </div>
      <div className="card-b">
        {/* ─────────────────────────────────────────────────
            Gekozen versie (groot)
        ───────────────────────────────────────────────── */}
        {editingSelected ? (
          <SelectedEditor
            type={type}
            draftSubject={draftSubject}
            draftBody={draftBody}
            savingEdit={savingEdit}
            busy={busy}
            onDraftSubjectChange={onDraftSubjectChange}
            onDraftBodyChange={onDraftBodyChange}
            onSave={onSaveEditVariant}
            onCancel={onCancelEditVariant}
            versieLabel={t("versionLabel", { n: safeSelected + 1 })}
          />
        ) : (
          <SelectedReader
            variant={selected}
            type={type}
            versieLabel={t("versionLabel", { n: safeSelected + 1 })}
            canEdit={canEdit}
            busy={busy}
            canRevert={canRevertToOriginal}
            onEdit={() => onStartEditVariant(safeSelected)}
            onRevert={handleRevert}
          />
        )}

        {/* ─────────────────────────────────────────────────
            Genereer 3 nieuwe versies — alleen in canEdit
        ───────────────────────────────────────────────── */}
        {canEdit && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border, #E5DFD0)",
            }}
          >
            <Button
              variant="secondary"
              onClick={onRegenerate}
              loading={refining}
              disabled={busy || variants.length >= 6}
              title={
                variants.length >= 6
                  ? t("regenerateMaxTitle")
                  : t("regenerateTitle")
              }
            >
              {refining
                ? t("regenerateWriting")
                : variants.length >= 6
                  ? t("regenerateMaxLabel")
                  : t("regenerateLabel")}
            </Button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────
            Andere versies — naast elkaar, volle tekst
        ───────────────────────────────────────────────── */}
        {alternatives.length > 0 && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border, #E5DFD0)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--ts)",
                marginBottom: 10,
              }}
            >
              {t("otherVersions", { count: alternatives.length })}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              {alternatives.map(({ v, idx }) => (
                <AlternativeBlock
                  key={idx}
                  variant={v}
                  type={type}
                  versieLabel={t("versionLabel", { n: idx + 1 })}
                  canEdit={canEdit}
                  busy={busy}
                  onPick={() => onSelectVariant(idx)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SelectedReader — Gekozen versie in lees-modus
// ============================================================
function SelectedReader({
  variant,
  versieLabel,
  canEdit,
  type,
  busy,
  canRevert,
  onEdit,
  onRevert,
}: {
  variant: InhoudVariant | undefined;
  type: "mail" | "social" | "whatsapp";
  versieLabel: string;
  canEdit: boolean;
  busy: boolean;
  canRevert: boolean;
  onEdit: () => void;
  onRevert: () => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_inhoud_card",
  );
  return (
    <div
      style={{
        position: "relative",
        padding: "14px 16px",
        borderRadius: 8,
        border: "2px solid var(--accent, #1F4A2D)",
        background: "var(--accent-light, #D6E0D8)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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
            color: "var(--accent, #1F4A2D)",
          }}
        >
          {versieLabel}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
            ✓ {t("chosen")}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
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
              ✎ {t("edit")}
            </button>
          )}
          {canRevert && (
            <button
              type="button"
              onClick={onRevert}
              disabled={busy}
              title={t("revertTitle")}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent, #1F4A2D)",
                width: 22,
                height: 22,
                lineHeight: 1,
                background: "var(--white, #FFFFFF)",
                borderRadius: 999,
                border: "1px solid var(--accent, #1F4A2D)",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {/* Onderwerp HOORT alleen bij mail. Voor social/whatsapp tonen we
          'm nooit — ook niet als de data per ongeluk een subject_line
          bevat (bv. een Instagram-campagne mag geen onderwerpregel). */}
      {type === "mail" &&
        (variant?.subject_line ? (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            <span style={{ opacity: 0.6, fontWeight: 500 }}>
              {t("subjectPrefix")}
            </span>{" "}
            {variant.subject_line}
          </div>
        ) : (
          <button
            type="button"
            onClick={canEdit ? onEdit : undefined}
            disabled={!canEdit || busy}
            style={{
              fontSize: 13,
              fontWeight: 500,
              fontStyle: "italic",
              color: "var(--danger, #DC2626)",
              background: "transparent",
              border: "1px dashed var(--danger, #DC2626)",
              borderRadius: 6,
              padding: "6px 10px",
              textAlign: "left",
              cursor: canEdit ? "pointer" : "default",
            }}
          >
            ◦ {t("subjectMissing")}
          </button>
        ))}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}
      >
        {variant?.body || (
          <em style={{ color: "var(--tl)" }}>{t("noContent")}</em>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SelectedEditor — Gekozen versie in edit-modus
// ============================================================
// Mail krijgt onderwerp-input; andere kanalen alleen body-textarea.
function SelectedEditor({
  type,
  draftSubject,
  draftBody,
  savingEdit,
  busy,
  onDraftSubjectChange,
  onDraftBodyChange,
  onSave,
  onCancel,
  versieLabel,
}: {
  type: "mail" | "social" | "whatsapp";
  draftSubject: string;
  draftBody: string;
  savingEdit: boolean;
  busy: boolean;
  onDraftSubjectChange: (val: string) => void;
  onDraftBodyChange: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
  versieLabel: string;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_inhoud_card",
  );
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 8,
        border: "2px solid var(--accent, #1F4A2D)",
        background: "var(--accent-light, #D6E0D8)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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
        {t("editingLabel", { label: versieLabel })}
      </div>
      {type === "mail" && (
        <input
          type="text"
          value={draftSubject}
          onChange={(e) => onDraftSubjectChange(e.target.value)}
          placeholder={t("subjectPlaceholder")}
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
        onChange={(e) => onDraftBodyChange(e.target.value)}
        placeholder={t("bodyPlaceholder")}
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
          minHeight: 160,
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <Button
          size="sm"
          onClick={onSave}
          loading={savingEdit}
          disabled={busy && !savingEdit}
        >
          {t("save")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          disabled={savingEdit}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// AlternativeBlock — een alternatief blok in de grid
// ============================================================
// Volle tekst zichtbaar (geen truncate). Klik = wordt Gekozen.
// Grid (parent) regelt de naast-elkaar-layout: auto-fit met min
// 260px zodat we op smalle schermen netjes onder elkaar wrappen.
function AlternativeBlock({
  variant,
  type,
  versieLabel,
  canEdit,
  busy,
  onPick,
}: {
  variant: InhoudVariant;
  type: "mail" | "social" | "whatsapp";
  versieLabel: string;
  canEdit: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_inhoud_card",
  );
  const interactive = canEdit && !busy;
  return (
    <button
      type="button"
      onClick={interactive ? onPick : undefined}
      disabled={!interactive}
      style={{
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--border, #E5DFD0)",
        background: "var(--white, #FFFFFF)",
        cursor: interactive ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "all 0.15s",
        opacity: !interactive ? 0.85 : 1,
      }}
      title={interactive ? t("pickTitle") : undefined}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--tl)",
        }}
      >
        {versieLabel}
      </div>
      {type === "mail" && variant.subject_line && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {variant.subject_line}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}
      >
        {variant.body || (
          <em style={{ color: "var(--tl)" }}>{t("noContent")}</em>
        )}
      </div>
    </button>
  );
}
