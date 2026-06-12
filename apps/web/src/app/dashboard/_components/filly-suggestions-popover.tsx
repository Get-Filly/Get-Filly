"use client";

import { usePathname, useRouter } from "next/navigation";
import { type OccupancyDay } from "../../../lib/api";
import type { SpecialDay } from "../../../lib/special-days";
import { Button } from "../../../components/ui/button";

// Twee render-vormen:
//   - 'button'  : compacte primary-knop (default). Voor toolbars, etc.
//   - 'card'    : full-height groene tile. Op het dashboard rechts
//                 naast de rode + gele stroken.
type TriggerMode = "button" | "card";

// ============================================================
// FillySuggestionsPopover → ingang naar de geleide chat-flow
// ============================================================
// Per 2026-06-12 (één-ingang-consolidatie): deze knop opent niet meer
// een eigen dag-selectie-popover. In plaats daarvan brengt 'ie de
// eigenaar naar de geleide chat-flow, dé plek waar Filly stap voor
// stap (dag → context → kanalen) een actie opbouwt. Zo is er één
// consistente ingang i.p.v. twee parallelle flows.
//
//   - op /dashboard      → start een vers chat-gesprek + scroll naar
//                          de Filly-chat (via window-event, geen
//                          remount).
//   - elders (/campagnes)→ navigeer naar /dashboard; een sessionStorage-
//                          vlag laat de chat daar de flow openen.
//
// De props (lowOccupancyDays/specialDays/occupancyThreshold) blijven
// in de signatuur voor de aanroepers, maar worden niet meer gebruikt —
// de chat haalt de dagen zelf op via useActionableDays.

type Props = {
  lowOccupancyDays?: OccupancyDay[];
  specialDays?: SpecialDay[];
  occupancyThreshold?: number;
  triggerMode?: TriggerMode;
};

export const START_GUIDED_EVENT = "filly-start-guided";

export function FillySuggestionsPopover({ triggerMode = "button" }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const goToChat = () => {
    if (pathname === "/dashboard") {
      // Zelfde pagina: geen navigatie/remount, dus een window-event
      // dat de FillyChat oppikt om een vers gesprek te starten.
      window.dispatchEvent(new CustomEvent(START_GUIDED_EVENT));
    } else {
      try {
        sessionStorage.setItem(START_GUIDED_EVENT, "1");
      } catch {
        // sessionStorage kan in zeldzame privacy-modi falen; dan valt
        // 'ie gewoon terug op een normale dashboard-navigatie.
      }
      router.push("/dashboard");
    }
  };

  if (triggerMode === "card") {
    return (
      <button
        type="button"
        onClick={goToChat}
        title="Open de Filly-chat en bouw stap voor stap een actie"
        style={{
          width: "100%",
          height: "100%",
          minHeight: 88,
          padding: "16px 18px",
          border: "none",
          borderRadius: "var(--rs, 8px)",
          background: "var(--brand, #1F4A2D)",
          color: "#FFFFFF",
          cursor: "pointer",
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
          e.currentTarget.style.filter = "brightness(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "none";
        }}
      >
        <span>Vraag Filly om voorstellen</span>
      </button>
    );
  }

  return (
    <Button variant="primary" onClick={goToChat}>
      ✨ Vraag Filly om voorstellen
    </Button>
  );
}
