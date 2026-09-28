"use client";

// ============================================================
// PROTOTYPE — herbouwde bezettingsrapportage
// ============================================================
//
// GEEN productie-code. Doel: de ECHTE bezettingspagina tonen zonder login,
// zodat de twee nieuwe blokken te beoordelen zijn.
//
// Wat hier echt is en wat niet:
//   ECHT  — de pagina zelf, en de cijfers in fixture.json: die komen uit
//           aggregateOccupancyReport, dezelfde functie die in productie
//           draait (apps/api/scripts/gen-bezetting-fixture.js).
//   MOCK  — de netwerk-laag. window.fetch wordt onderschept; de andere
//           blokken op de pagina (campagnes, gasten, ROI) krijgen lege
//           antwoorden en tonen dus hun lege staat.
//
// Bereikbaar op: http://localhost:3000/proto-bezetting. Uit de zoekindex
// via /proto- in robots.ts + noindex in layout.tsx.
// ============================================================

import "../dashboard/dashboard.css";
import BezettingPage from "../dashboard/rapportages/bezetting/page";
import fixture from "./fixture.json";

function stubbedResponse(url: string): unknown | undefined {
  if (url.includes("/busyness/me/occupancy-report")) return fixture;
  if (url.includes("/busyness/me/slot-report")) {
    // Blok 4 (wat een campagne deed) heeft eigen metingen nodig; in dit
    // prototype leeg, dan blijft dat blok verborgen zoals bedoeld.
    return { slots: [], businessMedianLift: 0, minSamples: 3 };
  }
  if (url.includes("/occupancy")) return [];
  if (url.includes("/campaigns")) return [];
  if (url.includes("/guests")) return [];
  if (url.includes("/kpi") || url.includes("/filly")) return [];
  if (url.includes("/restaurant/me") || url.includes("/business/me")) {
    return { id: "proto", name: "Bistro Prototype", low_occupancy_threshold: 50 };
  }
  return undefined;
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __protoBezettingPatched?: boolean };
  if (!w.__protoBezettingPatched) {
    w.__protoBezettingPatched = true;
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

export default function ProtoBezettingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAF7F1",
        // Ruim bovenin: de publieke navbar van het [locale]-layout is sticky.
        padding: "96px 24px 24px",
      }}
    >
      <div className="dashboard-shell" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <BezettingPage />
      </div>
    </main>
  );
}
