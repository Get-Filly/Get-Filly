"use client";

// ============================================================
// KpiStrip — dunne metriek-strook boven het dashboard
// ============================================================
// Dashboard v2 (2026-09). Verving de vier ring-meters (KpiRings): die namen
// veel ruimte en twee ervan stonden op "—" omdat er nog geen bron is. Een
// lege ring leest als kapot, dus metingen zonder bron tonen nu tekst plus een
// actie.
//
// LET OP: uitingen-quota en vindbaarheid zijn nog PLACEHOLDER (geen databron).
// Zie BACKLOG. De andere twee komen uit fetchKpis + useActionableDays.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { fetchKpis, type Kpis } from "@/lib/api";
import { useActionableDays } from "@/lib/use-actionable-days";
import { useLocale } from "next-intl";

export function KpiStrip() {
  const t = useTranslations("dash__components_kpi_rings");
  const locale = useLocale();
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
  const benut = actionable.coveredLowOccupancyCount;
  const totaal = benut + actionable.lowOccupancyDays.length;

  return (
    <div className="kpi-strip">
      <div className="kpi-cell">
        <div className="kpi-lab">{t("r2_kansen")}</div>
        <div className="kpi-row">
          <span className="kpi-val">{totaal > 0 ? `${benut} / ${totaal}` : "—"}</span>
          {totaal > 0 && (
            <span className="kpi-meta">{t("kansenMeta", { open: totaal - benut })}</span>
          )}
        </div>
        <div className="kpi-bar">
          <i style={{ width: `${totaal > 0 ? Math.round((benut / totaal) * 100) : 0}%` }} />
        </div>
      </div>

      <div className="kpi-cell">
        <div className="kpi-lab">{t("r3_campagnes")}</div>
        <div className="kpi-row">
          <span className="kpi-val">{active}</span>
          {pending > 0 && <span className="kpi-meta">{t("campagnesMeta", { n: pending })}</span>}
        </div>
        <div className="kpi-bar alt">
          <i
            style={{
              width: `${active + pending > 0 ? Math.round((active / (active + pending)) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      <div className="kpi-cell empty">
        <div className="kpi-lab">{t("r1_uitingen")}</div>
        <div className="kpi-row">
          <span className="kpi-val">{t("uitingenEmpty")}</span>
        </div>
        <Link className="kpi-link" href={`/${locale}/dashboard/campagnes`}>
          {t("uitingenCta")} →
        </Link>
      </div>

      <div className="kpi-cell empty">
        <div className="kpi-lab">{t("r4_vindbaarheid")}</div>
        <div className="kpi-row">
          <span className="kpi-val">{t("vindbaarheidEmpty")}</span>
        </div>
        <Link className="kpi-link" href={`/${locale}/dashboard/google-business`}>
          {t("vindbaarheidCta")} →
        </Link>
      </div>
    </div>
  );
}
