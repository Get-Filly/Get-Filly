"use client";

// ============================================================
// KpiRings — vier ring-meters onderaan het dashboard
// ============================================================
// Vervangt de oude platte KPI-rij. Elke ring toont een verhouding
// (bijv. "10 van de 30 uitingen gebruikt") als vulling + centrale
// waarde + label.
//
// LET OP: Floris herziet nog welke 4 metingen dit worden. Waar we al
// echte data hebben (rustige momenten benut, lopende campagnes) is die
// gebruikt; ring 1 (uitingen-quota) en ring 4 (vindbaarheid) zijn nog
// PLACEHOLDER tot er een databron is. Zie BACKLOG.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchKpis, type Kpis } from "@/lib/api";
import { useActionableDays } from "@/lib/use-actionable-days";

type Ring = {
  value: string; // centrale tekst
  pct: number; // 0..1 vulling
  label: string;
};

function RingMeter({ ring }: { ring: Ring }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.max(0, Math.min(1, ring.pct)));
  return (
    <div className="rcell">
      <div className="ring">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r={R} fill="none" stroke="var(--accent-light)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
          />
        </svg>
        <div className="ctr">{ring.value}</div>
      </div>
      <div className="lab">{ring.label}</div>
    </div>
  );
}

export function KpiRings() {
  const t = useTranslations("dash__components_kpi_rings");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const actionable = useActionableDays();

  useEffect(() => {
    let cancelled = false;
    fetchKpis()
      .then((k) => !cancelled && setKpis(k))
      .catch(() => !cancelled && setKpis(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const active = kpis?.active_campaigns ?? 0;
  const pending = kpis?.pending_suggestions ?? 0;

  // Rustige momenten: benut = al afgedekt met voorstel/campagne;
  // totaal = benut + nog open. Echte data uit useActionableDays.
  const benut = actionable.coveredLowOccupancyCount;
  const totaalKansen = benut + actionable.lowOccupancyDays.length;

  const rings: Ring[] = [
    // PLACEHOLDER — nog geen uitingen-quota in het datamodel.
    { value: "10/30", pct: 10 / 30, label: t("r1_uitingen") },
    {
      value: totaalKansen > 0 ? `${benut}/${totaalKansen}` : "—",
      pct: totaalKansen > 0 ? benut / totaalKansen : 0,
      label: t("r2_kansen"),
    },
    {
      value: `${active}`,
      pct: active + pending > 0 ? active / (active + pending) : 0,
      label: t("r3_campagnes"),
    },
    // PLACEHOLDER — vindbaarheid-score komt later uit het Google-profiel.
    { value: "85%", pct: 0.85, label: t("r4_vindbaarheid") },
  ];

  return (
    <div className="card kpi-rings-card">
      <div className="card-h">
        <div className="card-t">{t("title")}</div>
      </div>
      <div className="card-b">
        <div className="ring-grid">
          {rings.map((r) => (
            <RingMeter key={r.label} ring={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
