"use client";

import { aprilCampaigns, type Campaign } from "../_lib/month-campaigns";
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

function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
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
            <div className="det-cm">{c.meta}</div>
          </div>
          <div className={`det-cs ${c.status}`}>{statusLabel[c.status]}</div>
        </div>
      ))}
    </div>
  );
}

export function DetailCard({ view, year, month, selectedDay }: Props) {
  const monthName =
    maandenNL[month].charAt(0).toUpperCase() + maandenNL[month].slice(1);

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
          <CampaignList campaigns={aprilCampaigns} />
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
    // Mock: gasten + omzet afleiden uit bezetting
    const gasten = Math.round(occ * 0.85);
    const omzet = `€${(gasten * 42).toLocaleString("nl-NL")}`;
    // Campagnes op deze dag (mock filter: check op meta tekst met dagnummer)
    const dayCampaigns = aprilCampaigns.filter((c) =>
      c.meta.includes(`${selectedDay} `),
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
          <CampaignList campaigns={dayCampaigns} />
        </div>
      </div>
    );
  }

  // maand-view
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
        <CampaignList campaigns={aprilCampaigns} />
      </div>
    </div>
  );
}
