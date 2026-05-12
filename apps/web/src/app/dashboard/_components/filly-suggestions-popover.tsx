"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateSuggestionsForDates,
  type GenerateForDatesItem,
  type OccupancyDay,
} from "../../../lib/api";
import type { SpecialDay } from "../../../lib/special-days";
import { Button } from "../../../components/ui/button";

// Twee render-vormen:
//   - 'button'  : compacte primary-knop (default). Voor toolbars,
//                 modals, etc.
//   - 'card'    : full-height groene tile. Wordt op het dashboard
//                 gebruikt rechts naast de rode + gele stroken,
//                 lijnt qua hoogte uit met die 2 stroken samen.
type TriggerMode = "button" | "card";

// ============================================================
// FillySuggestionsPopover, dag-selectie + Claude-batch
// ============================================================
// Zit rechts naast de stroken op /dashboard. Klik = popover met
// multi-select uit:
//   1. Rustige dagen (komende 14 dgn, uit de rode strook)
//   2. Speciale dagen (komende 6 wkn, uit de gele strook)
//
// Na select → backend genereert per dag 1 ai_suggestion en de UI
// navigeert naar /campagnes zodat eigenaar de nieuwe voorstellen
// direct ziet.

type Props = {
  lowOccupancyDays: OccupancyDay[];
  specialDays: SpecialDay[];
  occupancyThreshold: number;
  triggerMode?: TriggerMode;
};

function formatDateNl(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function FillySuggestionsPopover({
  lowOccupancyDays,
  specialDays,
  occupancyThreshold,
  triggerMode = "button",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Map met key = `${kind}:${date}` zodat een rustige dag die ook
  // toevallig een feestdag is twee aparte toggles heeft.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Klik buiten popover → sluiten. Geen Escape want de user is
  // misschien nog aan het scrollen door de lijst.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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
          `${result.generated} ${result.generated === 1 ? "voorstel" : "voorstellen"} klaar, je gaat door…`,
        );
        setTimeout(() => router.push("/dashboard/campagnes"), 1000);
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

  const hasItems = lowOccupancyDays.length + specialDays.length > 0;
  const hintTitle = hasItems
    ? "Selecteer dagen waarover je een voorstel wilt"
    : "Geen rustige of speciale dagen in zicht";

  return (
    <div
      ref={popoverRef}
      style={{
        position: "relative",
        // In card-mode strekt de wrapper zich uit over de hele
        // grid-cel (vol hoogte van rode + gele strook samen).
        height: triggerMode === "card" ? "100%" : undefined,
      }}
    >
      {triggerMode === "card" ? (
        // Card-mode: groene tile-knop, vol hoog, gecentreerde
        // inhoud. Gebruikt brand-kleur voor onmiskenbare CTA-status.
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasItems}
          title={hintTitle}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 88,
            padding: "16px 18px",
            border: "none",
            borderRadius: "var(--rs, 8px)",
            background: hasItems
              ? "var(--brand, #1F4A2D)"
              : "var(--brand-soft, #D6E0D8)",
            color: hasItems ? "#FFFFFF" : "var(--tl, #71717A)",
            cursor: hasItems ? "pointer" : "not-allowed",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.3,
            textAlign: "center",
            transition: "filter 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (hasItems) e.currentTarget.style.filter = "brightness(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
          }}
        >
          <span>Vraag Filly om voorstellen</span>
        </button>
      ) : (
        <Button
          variant="primary"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasItems}
          title={hintTitle}
        >
          ✨ Vraag Filly om voorstellen
        </Button>
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            // Card-mode: popover hangt onder de tile, rechts uitgelijnd
            // op de tile zelf zodat 'ie niet buiten de viewport valt.
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 50,
            width: 360,
            maxHeight: 480,
            overflowY: "auto",
            background: "var(--white, #FFFFFF)",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 16,
          }}
        >
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
                    <span style={{ flex: 1 }}>
                      📉 {formatDateNl(d.date)}
                    </span>
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
                setOpen(false);
                setMessage(null);
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
      )}
    </div>
  );
}
