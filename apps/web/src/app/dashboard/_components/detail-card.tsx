"use client";

import { useEffect, useState } from "react";
import {
  fetchCampaigns,
  type Campaign,
  type OccupancyDay,
} from "../../../lib/api";
import { maandenNL, occupancyClass } from "../_lib/calendar-data";
import { Skeleton } from "./skeleton";

type View = "dag" | "maand" | "jaar";

type Props = {
  view: View;
  year: number;
  month: number;
  selectedDay: number | null;
  occupancy: OccupancyDay[];
  occLoading: boolean;
};

const statusLabel: Record<Campaign["status"], string> = {
  actief: "Actief",
  concept: "Concept",
  ingepland: "Ingepland",
  afgerond: "Afgerond",
};

function iconFor(type: Campaign["type"]) {
  return type === "mail" ? "✉️" : type === "social" ? "📱" : "💬";
}

function formatEuroFromCents(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}

function CampaignList({
  campaigns,
  loading,
  error,
}: {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={42} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ color: "var(--red)", fontSize: 12 }}>Fout: {error}</div>
    );
  }
  if (campaigns.length === 0) {
    return (
      <div style={{ color: "var(--tl)", fontSize: 12 }}>
        Geen campagnes in deze periode.
      </div>
    );
  }
  return (
    <div className="detail-campaigns">
      {campaigns.map((c) => (
        <div key={c.id} className="det-camp">
          <div className={`det-ci ${c.type}`}>{iconFor(c.type)}</div>
          <div>
            <div className="det-cn">{c.name}</div>
            <div className="det-cm">{c.meta ?? ""}</div>
          </div>
          <div className={`det-cs ${c.status}`}>{statusLabel[c.status]}</div>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="detail-stats">
      {[1, 2, 3].map((i) => (
        <div key={i} className="det-stat">
          <Skeleton height={20} width="60%" style={{ margin: "0 auto 8px" }} />
          <Skeleton height={12} width="70%" style={{ margin: "0 auto" }} />
        </div>
      ))}
    </div>
  );
}

export function DetailCard({
  view,
  year,
  month,
  selectedDay,
  occupancy,
  occLoading,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campLoading, setCampLoading] = useState(true);
  const [campError, setCampError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns()
      .then((d) => {
        setCampaigns(d);
        setCampLoading(false);
      })
      .catch((e: Error) => {
        setCampError(e.message);
        setCampLoading(false);
      });
  }, []);

  const monthName =
    maandenNL[month].charAt(0).toUpperCase() + maandenNL[month].slice(1);

  // Aggregaties uit occupancy (real data)
  const monthStats = {
    avg:
      occupancy.length > 0
        ? Math.round(
            occupancy.reduce((s, d) => s + d.occupancy_pct, 0) /
              occupancy.length,
          )
        : null,
    totalGuests: occupancy.reduce((s, d) => s + d.estimated_guests, 0),
    totalRevenue: occupancy.reduce(
      (s, d) => s + d.estimated_revenue_cents,
      0,
    ),
  };

  if (view === "jaar") {
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">{year}</div>
            <div className="card-st">Jaaroverzicht</div>
          </div>
        </div>
        <div className="card-b">
          <div className="detail-stats">
            <div className="det-stat">
              <div className="det-val">67%</div>
              <div className="det-label">Gem. bezetting</div>
            </div>
            <div className="det-stat">
              <div className="det-val">15.420</div>
              <div className="det-label">Totaal gasten</div>
            </div>
            <div className="det-stat">
              <div className="det-val">€648k</div>
              <div className="det-label">Geschatte omzet</div>
            </div>
          </div>
          <div className="det-section">Campagnes dit jaar</div>
          <CampaignList
            campaigns={campaigns}
            loading={campLoading}
            error={campError}
          />
        </div>
      </div>
    );
  }

  if (view === "dag" && selectedDay !== null) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
    const dayData = occupancy.find((d) => d.date === dateStr);
    const occ = dayData?.occupancy_pct ?? 0;
    const gasten = dayData?.estimated_guests ?? 0;
    const omzet = dayData
      ? formatEuroFromCents(dayData.estimated_revenue_cents)
      : "—";
    const dayCampaigns = campaigns.filter((c) =>
      (c.meta ?? "").includes(`${selectedDay} `),
    );

    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">
              {selectedDay} {monthName} {year}
            </div>
            <div className="card-st">Dagoverzicht</div>
          </div>
        </div>
        <div className="card-b">
          {occLoading ? (
            <StatsSkeleton />
          ) : (
            <div className="detail-stats">
              <div className="det-stat">
                <div className={`det-val ${occupancyClass(occ)}`}>{occ}%</div>
                <div className="det-label">Bezetting</div>
              </div>
              <div className="det-stat">
                <div className="det-val">{gasten}</div>
                <div className="det-label">Gasten</div>
              </div>
              <div className="det-stat">
                <div className="det-val">{omzet}</div>
                <div className="det-label">Omzet</div>
              </div>
            </div>
          )}
          <div className="det-section">Campagnes op deze dag</div>
          <CampaignList
            campaigns={dayCampaigns}
            loading={campLoading}
            error={campError}
          />
        </div>
      </div>
    );
  }

  // Maand-view (default)
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">
            {monthName} {year}
          </div>
          <div className="card-st">Maandoverzicht</div>
        </div>
      </div>
      <div className="card-b">
        {occLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="detail-stats">
            <div className="det-stat">
              <div className="det-val">
                {monthStats.avg !== null ? `${monthStats.avg}%` : "—"}
              </div>
              <div className="det-label">Gem. bezetting</div>
            </div>
            <div className="det-stat">
              <div className="det-val">
                {monthStats.totalGuests.toLocaleString("nl-NL")}
              </div>
              <div className="det-label">Totaal gasten</div>
            </div>
            <div className="det-stat">
              <div className="det-val">
                {formatEuroFromCents(monthStats.totalRevenue)}
              </div>
              <div className="det-label">Totale omzet</div>
            </div>
          </div>
        )}
        <div className="det-section">Campagnes deze maand</div>
        <CampaignList
          campaigns={campaigns}
          loading={campLoading}
          error={campError}
        />
      </div>
    </div>
  );
}
