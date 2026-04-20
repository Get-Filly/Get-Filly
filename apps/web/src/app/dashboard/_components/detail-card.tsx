"use client";

import { useEffect, useState } from "react";
import { fetchCampaigns, type Campaign } from "../../../lib/api";
import {
  getMonthData,
  maandenNL,
  occupancyClass,
} from "../_lib/calendar-data";

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
  return type === "mail" ? "✉️" : "📱";
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
      <div style={{ color: "var(--tl)", fontSize: 12 }}>Laden...</div>
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

function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCampaigns()
      .then((data) => {
        if (!cancelled) {
          setCampaigns(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { campaigns, loading, error };
}

export function DetailCard({ view, year, month, selectedDay }: Props) {
  const monthName =
    maandenNL[month].charAt(0).toUpperCase() + maandenNL[month].slice(1);
  const { campaigns, loading, error } = useCampaigns();

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
            loading={loading}
            error={error}
          />
        </div>
      </div>
    );
  }

  if (view === "dag") {
    if (!selectedDay) {
      return (
        <div className="card">
          <div className="card-h">
            <div>
              <div className="card-t">Geen dag gekozen</div>
              <div className="card-st">Klik een dag in de kalender</div>
            </div>
          </div>
          <div className="card-b">
            <div style={{ color: "var(--tl)", fontSize: 13 }}>
              Selecteer een dag om details te zien.
            </div>
          </div>
        </div>
      );
    }
    const cells = getMonthData(year, month);
    const dayData = cells.find((c) => c && c.day === selectedDay);
    const occ = dayData?.occupancy ?? 0;
    const gasten = Math.round(occ * 0.85);
    const omzet = `€${(gasten * 42).toLocaleString("nl-NL")}`;

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
          <div className="det-section">Campagnes op deze dag</div>
          <CampaignList
            campaigns={campaigns.filter((c) => (c.meta ?? "").includes(`${selectedDay} `))}
            loading={loading}
            error={error}
          />
        </div>
      </div>
    );
  }

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
        <div className="detail-stats">
          <div className="det-stat">
            <div className="det-val">68%</div>
            <div className="det-label">Gem. bezetting</div>
          </div>
          <div className="det-stat">
            <div className="det-val">1.284</div>
            <div className="det-label">Totaal gasten</div>
          </div>
          <div className="det-stat">
            <div className="det-val">€53.900</div>
            <div className="det-label">Totale omzet</div>
          </div>
        </div>
        <div className="det-section">Campagnes deze maand</div>
        <CampaignList campaigns={campaigns} loading={loading} error={error} />
      </div>
    </div>
  );
}
