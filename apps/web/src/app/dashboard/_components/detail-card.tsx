"use client";

import { useEffect, useState } from "react";
import {
  fetchCampaigns,
  type Campaign,
} from "../../../lib/api";
import { maandenNL } from "../_lib/calendar-data";
import { Skeleton } from "./skeleton";

type View = "dag" | "maand" | "jaar";

type Props = {
  view: View;
  year: number;
  month: number;
  selectedDay: number | null;
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

export function DetailCard({
  view,
  year,
  month,
  selectedDay,
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

  // Jaar-view: alle campagnes van dit jaar
  if (view === "jaar") {
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">{year}</div>
            <div className="card-st">Campagnes dit jaar</div>
          </div>
        </div>
        <div className="card-b">
          <CampaignList
            campaigns={campaigns}
            loading={campLoading}
            error={campError}
          />
        </div>
      </div>
    );
  }

  // Dag-view: alleen campagnes die op deze dag gepland staan
  if (view === "dag" && selectedDay !== null) {
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
            <div className="card-st">Campagnes op deze dag</div>
          </div>
        </div>
        <div className="card-b">
          <CampaignList
            campaigns={dayCampaigns}
            loading={campLoading}
            error={campError}
          />
        </div>
      </div>
    );
  }

  // Maand-view (default): alle campagnes in deze maand
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">
            {monthName} {year}
          </div>
          <div className="card-st">Campagnes deze maand</div>
        </div>
      </div>
      <div className="card-b">
        <CampaignList
          campaigns={campaigns}
          loading={campLoading}
          error={campError}
        />
      </div>
    </div>
  );
}
