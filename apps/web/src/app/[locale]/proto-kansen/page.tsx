"use client";

// ============================================================
// PROTOTYPE — rustige momenten met datum-variatie
// ============================================================
//
// GEEN productie-code. Doel: de ECHTE dashboard-kaart laten zien zonder
// login, zodat te beoordelen is waar de sterretjes staan en wat de kaart
// als reden noemt.
//
// Wat hier echt is en wat niet:
//   ECHT  — de kaart zelf (dashboard/_components/busyness-card.tsx),
//           inclusief i18n, en de kansen in fixture.json: die zijn
//           gegenereerd door BusynessService.getQuietMoments, dezelfde
//           code die in productie draait
//           (apps/api/scripts/gen-quiet-fixture.js).
//   MOCK  — de netwerk-laag. window.fetch wordt onderschept voor de
//           busyness/occupancy/restaurant-endpoints en beantwoord uit de
//           fixture. Er is geen API en geen Supabase-sessie nodig.
//
// ?oud=1 zet de beleidslaag uit: dan staan de sterretjes elke week op
// dezelfde weekdagen, het gedrag van vóór 2026-09-15. Een query-parameter
// i.p.v. React-state, zodat de kaart bij het wisselen een verse mount krijgt
// (ze haalt haar data in een useEffect op).
//
// Bereikbaar op: http://localhost:3000/proto-kansen
// ============================================================

// De kaart hangt aan de --bzv-*-variabelen uit de dashboard-stylesheet; buiten
// het dashboard-layout worden die niet geladen en tekent de grafiek zwart.
import "../dashboard/dashboard.css";
import { BusynessCard } from "../dashboard/_components/busyness-card";
import fixture from "./fixture.json";

function metBeleid(): boolean {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("oud") !== "1";
}

const BUSINESS = {
  id: "proto",
  name: "Bistro Prototype",
  low_occupancy_threshold: 50,
  opening_hours: fixture.openingHours,
  closed_dates: [],
};

function stubbedResponse(url: string): unknown | undefined {
  if (url.includes("/busyness/me/quiet-moments")) {
    return metBeleid() ? fixture.metBeleid : fixture.zonderBeleid;
  }
  if (url.includes("/busyness/me/actual")) return {};
  if (url.includes("/busyness/me")) {
    return {
      pattern: fixture.pattern,
      openingHours: fixture.openingHours,
      livePct: null,
      liveHour: null,
      liveWeekday: null,
      capturedAt: fixture.generatedAt,
    };
  }
  if (url.includes("/occupancy")) return [];
  if (url.includes("/restaurant/me") || url.includes("/business/me")) {
    return BUSINESS;
  }
  return undefined;
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __protoKansenPatched?: boolean };
  if (!w.__protoKansenPatched) {
    w.__protoKansenPatched = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const body = stubbedResponse(url);
      if (body !== undefined) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    };
  }
}

export default function ProtoKansenPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF7F1",
        // Ruim bovenin: de publieke navbar van het [locale]-layout is sticky
        // en zou anders de kop van de kaart afdekken.
        padding: "96px 24px 24px",
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div className="dashboard-shell">
          <BusynessCard />
        </div>
      </div>
    </main>
  );
}
