"use client";

import { useEffect, useState } from "react";
import { fetchKpis, fetchOccupancy, type Kpis, type OccupancyDay } from "../../../lib/api";
import { mergeMonthData } from "../_lib/calendar-data";
import { Skeleton } from "./skeleton";

// "Bezetting vandaag" moet exact hetzelfde tonen als de kalender-cel
// voor vandaag. Probleem dat dit oploste: de KPI-backend leverde
// today_pct soms null (todayStr-mismatch met de occupancy_days-rij),
// terwijl de kalender via mergeMonthData wél een waarde toont (echte
// data waar beschikbaar, anders seeded mock). Dat gaf 2 verschillende
// getallen voor dezelfde dag.
//
// Oplossing: bereken de bezetting-vandaag uit DEZELFDE bron als de
// kalender — mergeMonthData(jaar, maand, occupancy) en pak de cel van
// vandaag. Zo zijn KPI-tegel en kalender-cel per definitie identiek.
function todayPctFromOccupancy(occupancy: OccupancyDay[]): number | null {
  const now = new Date();
  const cells = mergeMonthData(now.getFullYear(), now.getMonth(), occupancy);
  const todayCell = cells.find((c) => c && c.day === now.getDate());
  return todayCell ? todayCell.occupancy : null;
}

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
function kpisToCards(kpis: Kpis, todayPct: number | null): KpiCard[] {
  const cards: KpiCard[] = [];

  cards.push({
    label: "Bezetting vandaag",
    value: todayPct !== null ? `${todayPct}%` : "—",
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
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchKpis()
      .then(setKpis)
      .catch((e: Error) => setError(e.message));
    // Occupancy van de huidige maand ophalen — zelfde bron als de
    // kalender — zodat "Bezetting vandaag" identiek is aan de today-cel.
    const now = new Date();
    fetchOccupancy(now.getFullYear(), now.getMonth())
      .then(setOccupancy)
      .catch(() => setOccupancy([]));
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

  const cards = kpisToCards(kpis, todayPctFromOccupancy(occupancy));

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
