"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type OccupancyDay } from "../../../lib/api";
import type { SpecialDay } from "../../../lib/special-days";
import { Button } from "../../../components/ui/button";
import { SuggestionsPanel } from "./suggestions-panel";

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
// Klik = popover met SuggestionsPanel (multi-select uit rustige +
// speciale dagen). Na succesvolle generate navigeren we naar
// /campagnes zodat de eigenaar de nieuwe voorstellen ziet.

type Props = {
  lowOccupancyDays: OccupancyDay[];
  specialDays: SpecialDay[];
  occupancyThreshold: number;
  triggerMode?: TriggerMode;
};

export function FillySuggestionsPopover({
  lowOccupancyDays,
  specialDays,
  occupancyThreshold,
  triggerMode = "button",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        // grid-cel (vol hoogte van rode + gele strook samen) én de
        // volle breedte van z'n ouder. Zonder width:100% krimpt deze
        // div als flex-item naar de tekstbreedte, waardoor de groene
        // knop smaller werd dan de kolom eronder.
        height: triggerMode === "card" ? "100%" : undefined,
        width: triggerMode === "card" ? "100%" : undefined,
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
            // Popover hangt onder de trigger, rechts uitgelijnd op de
            // trigger zelf zodat 'ie niet buiten de viewport valt.
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
          <SuggestionsPanel
            lowOccupancyDays={lowOccupancyDays}
            specialDays={specialDays}
            occupancyThreshold={occupancyThreshold}
            onSuccess={() => {
              setOpen(false);
              router.push("/dashboard/campagnes");
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
