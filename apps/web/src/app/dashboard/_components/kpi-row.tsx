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

function formatEuro(cents: number): string {
  const euros = Math.round(cents / 100);
  return `€${euros.toLocaleString("nl-NL")}`;
}

// Bouwt de KPI-cards op basis van wat de backend daadwerkelijk meet.
// De "door Filly"-onderregels worden gevuld uit de echte attributie
// (reservations.via_campaign_id, sinds migratie 0022). Geen mock-data
// meer — null betekent letterlijk "geen koppelingen deze maand".
function kpisToCards(kpis: Kpis): KpiCard[] {
  const huidigeMaand = new Date().toLocaleString("nl-NL", { month: "long" });
  const cards: KpiCard[] = [];

  cards.push({
    label: "Bezetting vandaag",
    value: kpis.today_pct !== null ? `${kpis.today_pct}%` : "—",
    fillyExtra: null,
  });

  cards.push({
    label: `Bezetting ${huidigeMaand}`,
    value: kpis.month_avg_pct !== null ? `${kpis.month_avg_pct}%` : "—",
    fillyExtra:
      kpis.month_filly_share_pct !== null && kpis.month_filly_share_pct > 0
        ? `${kpis.month_filly_share_pct}% via Filly`
        : null,
    positive: true,
  });

  cards.push({
    label: `Gasten ${huidigeMaand}`,
    value: kpis.month_guests.toLocaleString("nl-NL"),
    fillyExtra:
      kpis.month_filly_guests > 0
        ? `+${kpis.month_filly_guests} via Filly`
        : null,
    positive: true,
  });

  cards.push({
    label: "Voorgestelde campagnes",
    value: `${kpis.pending_suggestions}`,
    fillyExtra:
      kpis.pending_suggestions > 0 ? "wachten op goedkeuring" : null,
    positive: false,
  });

  cards.push({
    label: `Geschatte omzet ${huidigeMaand}`,
    value: formatEuro(kpis.month_revenue_cents),
    fillyExtra:
      kpis.month_filly_revenue_cents > 0
        ? `+${formatEuro(kpis.month_filly_revenue_cents)} via Filly`
        : null,
    positive: true,
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
        {[1, 2, 3, 4, 5].map((i) => (
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
