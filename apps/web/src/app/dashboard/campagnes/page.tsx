"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  whatsapp: "💬",
};

const AVG_SPEND_CENTS = 4500;

function formatEuroFromCents(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}

function campaignImpactEuro(c: Campaign): number {
  const stats = c.result_stats ?? {};
  if (typeof stats.extra_revenue_cents === "number") {
    return stats.extra_revenue_cents;
  }
  const res = stats.extra_reservations ?? 0;
  return res * AVG_SPEND_CENTS;
}

export default function CampagnesPage() {
  const router = useRouter();
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

  const totalImpact = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        const stats = c.result_stats ?? {};
        acc.reservations += stats.extra_reservations ?? 0;
        acc.revenue += campaignImpactEuro(c);
        acc.retention += stats.retention_guests ?? 0;
        return acc;
      },
      { reservations: 0, revenue: 0, retention: 0 },
    );
  }, [campaigns]);

  return (
    <div className="page-full">
      <div className="page-title">Campagnes</div>
      <div className="page-subtitle">
        Beheer je campagnes — en zie direct wat ze hebben opgeleverd.
      </div>

      {/* Impact-blok bovenaan */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Extra reserveringen</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              `+${totalImpact.reservations}`
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Geschatte extra omzet</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="60%" />
            ) : (
              formatEuroFromCents(totalImpact.revenue)
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Slapende gasten terug</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              totalImpact.retention
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Totaal campagnes</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="30%" /> : campaigns.length}
          </div>
        </div>
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
              <Skeleton height={18} width="30%" />
              <Skeleton height={18} width="15%" />
              <Skeleton height={18} width="20%" />
              <Skeleton height={18} width="15%" />
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
              <th>Impact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const stats = c.result_stats ?? {};
              const extraRes = stats.extra_reservations;
              const revenueCents = campaignImpactEuro(c);
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/campagnes/${c.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontSize: 18 }}>{typeIcon[c.type]}</td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: "var(--ts)", textTransform: "capitalize" }}>
                    {c.type}
                  </td>
                  <td style={{ color: "var(--tl)", fontSize: 12 }}>{c.meta}</td>
                  <td style={{ fontSize: 12 }}>
                    {extraRes ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--accent)" }}>
                          +{extraRes} reserveringen
                        </div>
                        <div style={{ color: "var(--tl)" }}>
                          {formatEuroFromCents(revenueCents)} extra
                        </div>
                      </div>
                    ) : c.status === "ingepland" ? (
                      <span style={{ color: "var(--tl)" }}>Nog niet verstuurd</span>
                    ) : c.status === "concept" ? (
                      <span style={{ color: "var(--tl)" }}>—</span>
                    ) : (
                      <span style={{ color: "var(--tl)" }}>Nog niet gemeten</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${c.status}`}>{c.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
