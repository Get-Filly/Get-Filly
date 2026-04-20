"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCampaigns, type Campaign } from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

type Filter = "alle" | "actief" | "ingepland" | "concept" | "afgerond";

const filters: { key: Filter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "actief", label: "Actief" },
  { key: "ingepland", label: "Ingepland" },
  { key: "concept", label: "Concept" },
  { key: "afgerond", label: "Afgerond" },
];

const typeIcon: Record<Campaign["type"], string> = {
  mail: "✉️",
  social: "📱",
  whatsapp: "💬" as unknown as string,
};

export default function CampagnesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("alle");

  useEffect(() => {
    fetchCampaigns()
      .then((d) => {
        setCampaigns(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (filter === "alle") return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  const count = (status: Filter) =>
    status === "alle"
      ? campaigns.length
      : campaigns.filter((c) => c.status === status).length;

  return (
    <div className="page-full">
      <div className="page-title">Campagnes</div>
      <div className="page-subtitle">
        Beheer al je campagnes — mail, social en straks WhatsApp.
      </div>

      <div className="tabs">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`tab-btn ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({count(f.key)})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="data-table" style={{ padding: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0" }}>
              <Skeleton height={18} width={18} />
              <Skeleton height={18} width="35%" />
              <Skeleton height={18} width="15%" />
              <Skeleton height={18} width="25%" />
              <Skeleton height={18} width="10%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : filtered.length === 0 ? (
        filter === "alle" ? (
          <div className="empty-state">
            <div className="empty-icon">📣</div>
            <div className="empty-title">Nog geen campagnes</div>
            <div className="empty-desc">
              Laat Filly een voorstel maken of start zelf een campagne — voor
              mail, social of WhatsApp.
            </div>
            <button className="btn-primary-dash">Nieuwe campagne</button>
          </div>
        ) : (
          <div className="table-empty">
            Geen campagnes met status &quot;{filter}&quot;.
          </div>
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Naam</th>
              <th>Type</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 18 }}>{typeIcon[c.type]}</td>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td style={{ color: "var(--ts)", textTransform: "capitalize" }}>
                  {c.type}
                </td>
                <td style={{ color: "var(--tl)", fontSize: 12 }}>{c.meta}</td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
