"use client";

// ============================================================
// PROTOTYPE — de "campagne stoppen"-popup
// ============================================================
//
// GEEN productie-code. Doel: het venster beoordelen zonder in te
// loggen, vóór het in een demo of App Review-video gebruikt wordt.
//
// Wat hier echt is en wat niet:
//   ECHT  — het venster zelf
//           (dashboard/campagnes/_components/stop-campaign-dialog.tsx),
//           inclusief de teksten uit messages/{nl,en}.json. Wat je hier
//           ziet is exact wat een eigenaar in het dashboard ziet.
//   MOCK  — de uitkomst. Er wordt niets gestopt en niets verwijderd;
//           de vier toestanden hieronder zijn met de hand ingevuld.
//
// De vier gevallen zijn niet willekeurig gekozen: het zijn de vier
// dingen die er echt kunnen gebeuren als iemand op Stop drukt.

import { useState } from "react";
import { StopCampaignDialog } from "../dashboard/campagnes/_components/stop-campaign-dialog";
import type { CampaignRetractReport } from "@/lib/api";

type Geval = {
  key: string;
  label: string;
  uitleg: string;
  result: CampaignRetractReport | null;
};

const GEVALLEN: Geval[] = [
  {
    key: "bevestigen",
    label: "1. Bevestigen",
    uitleg:
      "Wat je ziet vlak nadat je op Stop klikt. Stoppen verwijdert de posts echt, dus er komt eerst een vraag.",
    result: null,
  },
  {
    key: "gelukt",
    label: "2. Allebei verwijderd",
    uitleg:
      "Het normale geval. Per kanaal een regel, zodat zichtbaar is dát de post weg is en niet alleen dat de campagne naar Concept ging.",
    result: {
      facebook: "deleted",
      instagram: "deleted",
      needsReconnect: false,
      instagramManualUrl: null,
      errors: [],
    },
  },
  {
    key: "opnieuw-verbinden",
    label: "3. Koppeling mist rechten",
    uitleg:
      "Een koppeling van vóór 25 september 2026 heeft instagram_manage_contents niet. Meta weigert dan te verwijderen. Dat is geen storing maar een koppeling die opnieuw gelegd moet worden, en dat moet de melding ook zeggen.",
    result: {
      facebook: "deleted",
      instagram: "failed",
      needsReconnect: true,
      instagramManualUrl: "https://www.instagram.com/p/voorbeeld/",
      errors: ["Instagram-post verwijderen mislukt: (code 200)"],
    },
  },
  {
    key: "mislukt",
    label: "4. Verwijderen mislukt",
    uitleg:
      "Meta was onbereikbaar of gaf een fout. De campagne gaat wél naar Concept, anders kun je 'm helemaal niet meer stoppen, maar de post staat nog live. Dan is de directe link het enige dat verder helpt.",
    result: {
      facebook: "skipped",
      instagram: "failed",
      needsReconnect: false,
      instagramManualUrl: "https://www.instagram.com/p/voorbeeld/",
      errors: ["Instagram-post verwijderen mislukt: time-out"],
    },
  },
];

export default function ProtoStopPopup() {
  const [open, setOpen] = useState<Geval | null>(null);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper, #FAF7F1)",
        padding: "120px 24px 64px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--brand, #1F4A2D)",
            margin: "0 0 6px",
            fontWeight: 600,
          }}
        >
          Prototype
        </p>
        <h1 style={{ fontSize: 28, margin: "0 0 10px", lineHeight: 1.25 }}>
          Campagne stoppen
        </h1>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#4A4A4A",
            margin: "0 0 8px",
          }}
        >
          Dit is het venster dat verschijnt wanneer een eigenaar een actieve
          campagne stopt. Sinds 25 september verwijdert Filly ook de
          Instagram-post; daarvóór kon dat alleen bij Facebook en moest de
          eigenaar Instagram zelf weghalen.
        </p>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#4A4A4A",
            margin: "0 0 28px",
          }}
        >
          Het venster hieronder is de echte component, met de echte teksten.
          Alleen de uitkomst is hier verzonnen; er wordt niets gestopt.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {GEVALLEN.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setOpen(g)}
              style={{
                textAlign: "left",
                background: "#FFFFFF",
                border: "1px solid var(--border, #E5DFD0)",
                borderRadius: 10,
                padding: "16px 18px",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <div
                style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}
              >
                {g.label}
              </div>
              <div
                style={{ fontSize: 13.5, lineHeight: 1.55, color: "#5B5B5B" }}
              >
                {g.uitleg}
              </div>
            </button>
          ))}
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: "#7A7A7A",
            lineHeight: 1.6,
          }}
        >
          Taal wisselen kan via <code>/en/proto-stop-popup</code>; de teksten
          komen uit dezelfde vertaalbestanden als het dashboard.
        </p>
      </div>

      {open && (
        <StopCampaignDialog
          busy={false}
          result={open.result}
          onClose={() => setOpen(null)}
          // In het echte dashboard stopt dit de campagne. Hier springen we
          // door naar het resultaat van geval 2, zodat de overgang van
          // "bevestigen" naar "klaar" te zien is.
          onConfirm={() => setOpen(GEVALLEN[1])}
        />
      )}
    </main>
  );
}
