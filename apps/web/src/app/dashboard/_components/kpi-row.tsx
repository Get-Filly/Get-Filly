"use client";

import { useEffect, useState } from "react";
import { fetchKpis, type Kpis } from "../../../lib/api";
import { Skeleton } from "./skeleton";

type KpiCard = {
  label: string;
  value: string;
  trend: string;
  trendDir: "up" | "down" | "neutral";
};

const trendClass = {
  up: "tu",
  down: "td",
  neutral: "tn",
};

function formatEuro(cents: number): string {
  const euros = Math.round(cents / 100);
  return `€${euros.toLocaleString("nl-NL")}`;
}

function kpisToCards(kpis: Kpis): KpiCard[] {
  const huidigeMaand = new Date().toLocaleString("nl-NL", { month: "long" });
  const cards: KpiCard[] = [];

  if (kpis.today_pct !== null && kpis.weekday_avg_pct !== null) {
    const diff = kpis.today_pct - kpis.weekday_avg_pct;
    const dir: KpiCard["trendDir"] = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
    const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "—";
    cards.push({
      label: "Bezetting vandaag",
      value: `${kpis.today_pct}%`,
      trend: `${arrow} ${Math.abs(diff)}%`,
      trendDir: dir,
    });
  } else {
    cards.push({
      label: "Bezetting vandaag",
      value: "—",
      trend: "geen data",
      trendDir: "neutral",
    });
  }

  cards.push({
    label: `Bezetting ${huidigeMaand}`,
    value: kpis.month_avg_pct !== null ? `${kpis.month_avg_pct}%` : "—",
    trend: "↑ 4%",
    trendDir: "up",
  });

  cards.push({
    label: `Gasten ${huidigeMaand}`,
    value: kpis.month_guests.toLocaleString("nl-NL"),
    trend: "↑ 12%",
    trendDir: "up",
  });

  cards.push({
    label: "Voorgestelde campagnes",
    value: `${kpis.pending_suggestions}`,
    trend: "ter goedkeuring",
    trendDir: "neutral",
  });

  cards.push({
    label: `Geschatte omzet ${huidigeMaand}`,
    value: formatEuro(kpis.month_revenue_cents),
    trend: "↑ 8%",
    trendDir: "up",
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
          <div className="kpi-ri">
            <span className="kpi-val">{k.value}</span>
            <span className={`kpi-trend ${trendClass[k.trendDir]}`}>
              {k.trend}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
