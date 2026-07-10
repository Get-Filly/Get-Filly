"use client";

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
  // Voorlopige koppeling: bij "Maak concept" scrollen we naar de Filly-
  // chat zodat de eigenaar de dag daar oppakt. Latere fase: de gekozen
  // datum vooraf invullen in de geleide flow.
  function handleMakeConcept() {
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
          <FillyChat />
        </div>
      </div>
    </div>
  );
}
