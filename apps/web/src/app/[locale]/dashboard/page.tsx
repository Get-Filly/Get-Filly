"use client";

import { useState } from "react";
import { BusynessCard } from "./_components/busyness-card";
import { KpiRings } from "./_components/kpi-rings";
import { FillyChat } from "./_components/filly-chat";

// Herontworpen dashboard (2026-07):
//   - Bovenaan, vol de breedte: horizontale KPI-ringen-strook.
//   - Daaronder twee blokken: links BusynessCard (dag-strip + dag-grafiek),
//     rechts de Filly-chat. Doel: alles in één oogopslag (past in de
//     viewport, vaste-hoogte-model, geen pagina-scroll).
// De oude banners (UpcomingActionsBlock), de platte KPI-rij (KpiRow) en
// de kalender (CalendarCard) zijn vervangen. De drukte komt nu uit
// _lib/busyness.ts (naad naar de latere Google "populaire tijden"-bron).
export default function DashboardPage() {
  // "Maak een campagne" op een rustig moment in de grafiek → de gekozen dag
  // wordt aan de Filly-chat doorgegeven, die de geleide flow direct voor die
  // dag opent. We scrollen ook even naar de chat.
  const [seedDate, setSeedDate] = useState<string | null>(null);

  function handleMakeConcept(iso: string) {
    setSeedDate(iso);
    document
      .getElementById("filly-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="page">
      <div className="dash-top">
        <KpiRings />
      </div>
      <div className="dash-body">
        <div className="left-col">
          <BusynessCard onMakeConcept={handleMakeConcept} />
        </div>
        <div className="right-col" id="filly-panel">
          <FillyChat seedDate={seedDate} onSeedConsumed={() => setSeedDate(null)} />
        </div>
      </div>
    </div>
  );
}
