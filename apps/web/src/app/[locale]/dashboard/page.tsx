"use client";

import { useState } from "react";
import { BusynessCard } from "./_components/busyness-card";
import { KpiStrip } from "./_components/kpi-strip";
import { FillyChat } from "./_components/filly-chat";

// Herontworpen dashboard (2026-09, v2):
//   - Bovenaan een dunne metriek-strook (was: vier ring-meters).
//   - Daaronder een werkgebied met de staafgrafiek, het inzicht en het
//     waarom-vak, en rechts Filly als vaste rail over de volle hoogte.
// Beide kolommen scrollen apart; de pagina zelf scrollt niet. De knoppenrij
// onder het werkgebied eindigt op dezelfde hoogte als de chat-invoer.
export default function DashboardPage() {
  // "Maak een campagne" geeft de gekozen dag door aan de chat, die de
  // geleide flow direct voor die dag opent.
  const [seedDate, setSeedDate] = useState<string | null>(null);

  function handleMakeConcept(iso: string) {
    setSeedDate(iso);
    document
      .getElementById("filly-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="page dash-v2">
      <div className="dash-strip">
        <KpiStrip />
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
