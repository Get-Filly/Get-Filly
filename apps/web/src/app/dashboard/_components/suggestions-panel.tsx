"use client";

import { useState } from "react";
import {
  generateSuggestionsForDates,
  type GenerateForDatesItem,
  type OccupancyDay,
} from "../../../lib/api";
import type { SpecialDay } from "../../../lib/special-days";
import { Button } from "../../../components/ui/button";

// ============================================================
// SuggestionsPanel, multi-select + Filly-genereer-knop
// ============================================================
// Headless-ish UI-blok dat de dag-selectie + generate-action levert.
// Per 2026-05-21: alleen nog gebruikt door FillySuggestionsPopover
// op het dashboard (groene tile → dropdown). De TasksStrip op
// /campagnes is verwijderd; deze panel was de gedeelde UI maar
// is na de verwijdering single-caller geworden.
//
// De caller bepaalt wat er na succes gebeurt via onSuccess (bv.
// navigeren naar /campagnes) en wat er bij cancel gebeurt via
// onCancel (popover sluiten).

type Props = {
  lowOccupancyDays: OccupancyDay[];
  specialDays: SpecialDay[];
  occupancyThreshold: number;
  // Callbacks. Wordt aangeroepen ná de Claude-batch.
  onSuccess?: (generatedCount: number) => void;
  // "Annuleren"-knop, of klik-buiten in de popover-variant.
  onCancel?: () => void;
};

function formatDateNl(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SuggestionsPanel({
  lowOccupancyDays,
  specialDays,
  occupancyThreshold,
  onSuccess,
  onCancel,
}: Props) {
  // Map met key = `${kind}:${date}` zodat een rustige dag die ook
  // toevallig een feestdag is twee aparte toggles heeft.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setMessage(null);

    // Reconstrueer items uit de geselecteerde keys.
    const items: GenerateForDatesItem[] = [];
    for (const key of selected) {
      const [kind, date] = key.split(":");
      if (kind === "low_occupancy") {
        items.push({ date, kind: "low_occupancy" });
      } else if (kind === "special_day") {
        const sp = specialDays.find((s) => s.date === date);
        if (sp) {
          items.push({ date, kind: "special_day", name: sp.name });
        }
      }
    }

    try {
      const result = await generateSuggestionsForDates(items);
      if (result.generated > 0) {
        setMessage(
          `${result.generated} ${result.generated === 1 ? "voorstel" : "voorstellen"} klaar.`,
        );
        // Korte vertraging zodat de gebruiker de "klaar"-melding nog
        // even ziet, dan parent-callback (navigeren of refreshen).
        setTimeout(() => onSuccess?.(result.generated), 800);
      } else {
        setMessage(
          "Filly kon op dit moment geen voorstellen maken. Probeer het zo opnieuw.",
        );
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Iets ging mis. Probeer het opnieuw.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 4,
          color: "var(--text, #18181B)",
        }}
      >
        Voor welke dagen?
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--tl)",
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        Kies 1 of meer dagen. Filly maakt per dag een toegespitst
        voorstel.
      </div>

      {/* ----- Rustige dagen ----- */}
      {lowOccupancyDays.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "var(--tl)",
              marginBottom: 6,
              marginTop: 4,
              letterSpacing: 0.5,
            }}
          >
            Rustige dagen (&lt; {occupancyThreshold}%)
          </div>
          {lowOccupancyDays.map((d) => {
            const key = `low_occupancy:${d.date}`;
            const active = selected.has(key);
            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: active
                    ? "1px solid var(--brand, #1F4A2D)"
                    : "1px solid var(--border, #E5DFD0)",
                  background: active
                    ? "var(--brand-soft, #eef3ee)"
                    : "transparent",
                  borderRadius: 6,
                  marginBottom: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(key)}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>📉 {formatDateNl(d.date)}</span>
                <span style={{ fontSize: 11, color: "var(--tl)" }}>
                  {d.occupancy_pct}%
                </span>
              </label>
            );
          })}
        </>
      )}

      {/* ----- Speciale dagen ----- */}
      {specialDays.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "var(--tl)",
              marginBottom: 6,
              marginTop: 12,
              letterSpacing: 0.5,
            }}
          >
            Speciale dagen
          </div>
          {specialDays.map((s) => {
            const key = `special_day:${s.date}`;
            const active = selected.has(key);
            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: active
                    ? "1px solid var(--brand, #1F4A2D)"
                    : "1px solid var(--border, #E5DFD0)",
                  background: active
                    ? "var(--brand-soft, #eef3ee)"
                    : "transparent",
                  borderRadius: 6,
                  marginBottom: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(key)}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>
                  {s.emoji} {s.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--tl)" }}>
                  {formatDateNl(s.date)}
                </span>
              </label>
            );
          })}
        </>
      )}

      {message && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "var(--bg-soft, #FAF7F1)",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--text, #18181B)",
            lineHeight: 1.4,
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 14,
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(new Set());
            setMessage(null);
            onCancel?.();
          }}
          disabled={submitting}
        >
          Annuleren
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          disabled={selected.size === 0 || submitting}
          loading={submitting}
        >
          Genereer {selected.size > 0 && `(${selected.size})`}
        </Button>
      </div>
    </div>
  );
}
