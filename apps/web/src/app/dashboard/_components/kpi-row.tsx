"use client";

import { useEffect, useState } from "react";
import { fetchKpis, type Kpis } from "../../../lib/api";
import { Skeleton } from "./skeleton";

type KpiCard = {
  label: string;
  value: string;
  // Onderregel: wat Filly voor deze KPI heeft opgeleverd. Groen wanneer
  // positive=true; grijs voor neutrale meldingen ("wachten op..."). Null
  // = geen onderregel tonen.
  fillyExtra: string | null;
  positive?: boolean;
};

// Vier KPI's op het dashboard (Floris-keuze 2026-05-12):
//   1. Bezetting vandaag      — "hoe staat 't er nu voor"
//   2. Gasten vandaag         — totaal-volume, Filly-deel als sub
//   3. Lopende campagnes      — wat draait er op dit moment
//   4. Voorgestelde campagnes — wat wacht op je goedkeuring
//
// Eerder hadden we ook Gasten mei + Geschatte omzet mei, maar
// Floris koos voor de scherpere "klant-focus" presentatie: pure
// vandaag-snapshot + 2 campagne-state-tegels.
function kpisToCards(kpis: Kpis): KpiCard[] {
  const cards: KpiCard[] = [];

  cards.push({
    label: "Bezetting vandaag",
    value: kpis.today_pct !== null ? `${kpis.today_pct}%` : "—",
    fillyExtra: null,
  });

  cards.push({
    label: "Gasten vandaag",
    value: kpis.today_guests.toLocaleString("nl-NL"),
    fillyExtra:
      kpis.today_filly_guests > 0
        ? `+${kpis.today_filly_guests} via Filly`
        : "0 via Filly",
    positive: kpis.today_filly_guests > 0,
  });

  cards.push({
    label: "Lopende campagnes",
    value: kpis.active_campaigns.toLocaleString("nl-NL"),
    fillyExtra:
      kpis.active_campaigns > 0 ? "actief of ingepland" : "geen actieve",
    positive: kpis.active_campaigns > 0,
  });

  cards.push({
    label: "Voorgestelde campagnes",
    value: `${kpis.pending_suggestions}`,
    fillyExtra:
      kpis.pending_suggestions > 0 ? "wachten op goedkeuring" : null,
    positive: false,
  });

  return cards;
}

export function KpiRow() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchKpis()
      .then(setKpis)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Bij een fout (bv. nog geen reserveringen-data, geen restaurant-
  // koppeling) tonen we een rustige melding in plaats van een rode
  // HTTP-fout. Eigenaar kan ondertussen verder met andere onderdelen.
  if (error) {
    return (
      <div className="kpi-row">
        <div className="kpi" style={{ gridColumn: "1 / -1" }}>
          <div className="kpi-label">Cijfers nog niet beschikbaar</div>
          <div className="kpi-filly" style={{ marginTop: 4 }}>
            Zodra je reserveringen en campagnes binnenkomen verschijnen
            de KPI&apos;s hier.
          </div>
        </div>
      </div>
    );
  }

  if (!kpis) {
    return (
      <div className="kpi-row">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi">
            <Skeleton height={10} width="70%" style={{ marginBottom: 10 }} />
            <Skeleton height={22} width="50%" />
          </div>
        ))}
      </div>
    );
  }

  const cards = kpisToCards(kpis);

  return (
    <div className="kpi-row">
      {cards.map((k) => (
        <div key={k.label} className="kpi">
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-val">{k.value}</div>
          {k.fillyExtra && (
            <div
              className={`kpi-filly ${k.positive ? "kpi-filly-positive" : ""}`}
            >
              {k.fillyExtra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
