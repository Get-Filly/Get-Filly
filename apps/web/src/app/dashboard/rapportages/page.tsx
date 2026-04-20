"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCampaigns, fetchGuests, type Campaign, type Guest } from "../../../lib/api";

type Period = "maand" | "kwartaal" | "jaar";

const periodLabel: Record<Period, string> = {
  maand: "Deze maand",
  kwartaal: "Dit kwartaal",
  jaar: "Dit jaar",
};

export default function RapportagesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("maand");

  useEffect(() => {
    Promise.all([fetchCampaigns(), fetchGuests()])
      .then(([c, g]) => {
        setCampaigns(c);
        setGuests(g);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalGuests = guests.length;
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter((c) => c.status === "actief").length;
    const byType = campaigns.reduce(
      (acc, c) => {
        acc[c.type] = (acc[c.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { totalGuests, totalCampaigns, activeCampaigns, byType };
  }, [campaigns, guests]);

  // Mock: deze data zou uit occupancy_days komen (stap 8B vervolg)
  const occupancyAvg = 68;
  const guestsMonth = 1284;
  const revenueMonth = "€53.900";

  return (
    <div className="page-full">
      <div className="page-title">Rapportages</div>
      <div className="page-subtitle">
        Overzicht van bezetting, gasten, campagnes en omzet.
      </div>

      <div className="tabs">
        {(["maand", "kwartaal", "jaar"] as Period[]).map((p) => (
          <button
            key={p}
            className={`tab-btn ${period === p ? "active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {periodLabel[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="table-empty">Laden...</div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-label">Gem. bezetting</div>
              <div className="stat-card-val">{occupancyAvg}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Totaal gasten</div>
              <div className="stat-card-val">{guestsMonth}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Omzet</div>
              <div className="stat-card-val">{revenueMonth}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Campagnes</div>
              <div className="stat-card-val">{stats.totalCampaigns}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Actieve gasten in DB</div>
              <div className="stat-card-val">{stats.totalGuests}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div>
                <div className="card-t">Campagnes per kanaal</div>
                <div className="card-st">{periodLabel[period]}</div>
              </div>
            </div>
            <div className="card-b">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div
                    key={type}
                    style={{
                      padding: "12px 18px",
                      background: "var(--bg)",
                      borderRadius: 10,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ color: "var(--tl)", fontSize: 11, textTransform: "capitalize" }}>
                      {type}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div>
                <div className="card-t">Top campagnes</div>
                <div className="card-st">Meest succesvol deze periode</div>
              </div>
            </div>
            <div className="card-b">
              {campaigns
                .filter((c) => c.status === "actief" || c.status === "afgerond")
                .slice(0, 3)
                .map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{c.name}</div>
                      <div style={{ color: "var(--tl)", fontSize: 11 }}>{c.meta}</div>
                    </div>
                    <span className={`badge ${c.status}`}>{c.status}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 12, color: "var(--tl)" }}>
        Bezetting/omzet-cijfers worden in Stap 8B gekoppeld aan de{" "}
        <code>occupancy_days</code>-tabel. Nu is dat nog mock-data.
      </div>
    </div>
  );
}
