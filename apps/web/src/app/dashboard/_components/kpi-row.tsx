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

/**
 * Mock: aantal gasten/omzet dat Filly deze maand opleverde.
 * TODO: aggregeren uit campagne-data (fetchCampaigns) of later een
 * dedicated backend-endpoint /api/kpi/filly-roi.
 */
const FILLY_MOCK = {
  todayExtraReservations: 2,
  monthExtraGuests: 67,
  monthExtraRevenueCents: 420000, // €4.200
};

function kpisToCards(kpis: Kpis): KpiCard[] {
  const huidigeMaand = new Date().toLocaleString("nl-NL", { month: "long" });
  const cards: KpiCard[] = [];

  cards.push({
    label: "Bezetting vandaag",
    value:
      kpis.today_pct !== null ? `${kpis.today_pct}%` : "—",
    fillyExtra:
      FILLY_MOCK.todayExtraReservations > 0
        ? `+${FILLY_MOCK.todayExtraReservations} reserveringen door Filly`
        : null,
    positive: true,
  });

  // Voor bezetting-maand rekenen we Filly's aandeel als percentage van
  // het totaal aantal gasten. Logica: als 67 van de 977 gasten via Filly
  // kwamen, dan is 7% van de gerealiseerde bezetting door Filly. Dat
  // sluit aan bij hoe een ondernemer naar de getallen kijkt.
  const fillyShare =
    kpis.month_guests > 0
      ? Math.round((FILLY_MOCK.monthExtraGuests / kpis.month_guests) * 100)
      : 0;
  cards.push({
    label: `Bezetting ${huidigeMaand}`,
    value: kpis.month_avg_pct !== null ? `${kpis.month_avg_pct}%` : "—",
    fillyExtra:
      fillyShare > 0 ? `${fillyShare}% gerealiseerd door Filly` : null,
    positive: true,
  });

  cards.push({
    label: `Gasten ${huidigeMaand}`,
    value: kpis.month_guests.toLocaleString("nl-NL"),
    fillyExtra: `+${FILLY_MOCK.monthExtraGuests} door Filly`,
    positive: true,
  });

  cards.push({
    label: "Voorgestelde campagnes",
    value: `${kpis.pending_suggestions}`,
    fillyExtra: kpis.pending_suggestions > 0 ? "wachten op goedkeuring" : null,
    positive: false,
  });

  cards.push({
    label: `Geschatte omzet ${huidigeMaand}`,
    value: formatEuro(kpis.month_revenue_cents),
    fillyExtra: `+${formatEuro(FILLY_MOCK.monthExtraRevenueCents)} door Filly`,
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

  if (error) {
    return (
      <div className="kpi-row">
        <div className="kpi" style={{ gridColumn: "1 / -1" }}>
          <div className="kpi-label" style={{ color: "var(--red)" }}>
            Fout bij laden KPI&apos;s: {error}
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
