"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchGuests,
  type Guest,
  computeCustomerStatus,
  type CustomerStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

/**
 * Bepaalt of een gast via Filly is binnengekomen.
 * MOCK: deterministisch op basis van guest-id (~20%). Later: join op
 * reservations.source of een dedicated guests.acquired_via-veld.
 */
function isFromFilly(g: Guest): boolean {
  const code = g.id.charCodeAt(g.id.length - 1);
  return code % 5 === 0;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatEuro(cents: number | null): string {
  if (cents === null) return "—";
  return `€${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

const statusInfo: Record<CustomerStatus, { label: string; color: string; bg: string }> = {
  nieuw: { label: "Nieuw", color: "#0284C7", bg: "#E0F2FE" },
  vaste_gast: { label: "Vaste gast", color: "#1B7A2E", bg: "#DCFCE7" },
  vip: { label: "VIP", color: "#7C2D12", bg: "#FED7AA" },
  at_risk: { label: "At-risk", color: "#B45309", bg: "#FEF3C7" },
  verloren: { label: "Verloren", color: "#71717A", bg: "#F4F4F5" },
};

type FilterStatus = "alle" | CustomerStatus;

const statusFilters: FilterStatus[] = [
  "alle",
  "vip",
  "vaste_gast",
  "nieuw",
  "at_risk",
];

export default function GastenPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("alle");

  useEffect(() => {
    fetchGuests()
      .then((d) => {
        setGuests(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const active90 = guests.filter((g) => {
      const d = daysSince(g.last_visit_at);
      return d !== null && d <= 90;
    }).length;
    const optIns = guests.filter((g) => g.mail_opt_in).length;
    const vips = guests.filter((g) => computeCustomerStatus(g) === "vip").length;
    const atRisk = guests.filter(
      (g) => computeCustomerStatus(g) === "at_risk",
    ).length;
    const totalLtv = guests.reduce(
      (s, g) => s + (g.lifetime_value_cents ?? 0),
      0,
    );
    const currentMonth = new Date().getMonth();
    const birthdaysThisMonth = guests.filter((g) => {
      if (!g.birthday) return false;
      return new Date(g.birthday).getMonth() === currentMonth;
    });
    const viaFilly = guests.filter(isFromFilly).length;
    return {
      total: guests.length,
      active90,
      optIns,
      vips,
      atRisk,
      totalLtv,
      birthdaysThisMonth,
      viaFilly,
    };
  }, [guests]);

  const filtered = useMemo(() => {
    let out = guests;
    if (filter !== "alle") {
      out = out.filter((g) => computeCustomerStatus(g) === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((g) =>
        `${g.first_name ?? ""} ${g.last_name ?? ""} ${g.email ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    return out;
  }, [guests, filter, query]);

  return (
    <div className="page-full">
      <div className="page-title">Gasten</div>
      <div className="page-subtitle">
        Wie jouw restaurant bezoekt — met voorkeuren, allergieën en waarde.
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Totaal gasten</div>
          <div className="stat-card-val">{stats.total}</div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Via Filly</div>
          <div className="stat-card-val">{stats.viaFilly}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Actief (90 dgn)</div>
          <div className="stat-card-val">{stats.active90}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">VIPs</div>
          <div className="stat-card-val">{stats.vips}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">At-risk</div>
          <div className="stat-card-val">{stats.atRisk}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Mail opt-ins</div>
          <div className="stat-card-val">{stats.optIns}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Totaal LTV</div>
          <div className="stat-card-val">{formatEuro(stats.totalLtv)}</div>
        </div>
      </div>

      {stats.birthdaysThisMonth.length > 0 && (
        <div
          style={{
            background: "var(--accent-light)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: "14px 18px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 20 }}>🎂</div>
          <div>
            <strong>{stats.birthdaysThisMonth.length}</strong> gast
            {stats.birthdaysThisMonth.length > 1 ? "en" : ""} jarig deze maand:{" "}
            <span style={{ color: "var(--ts)" }}>
              {stats.birthdaysThisMonth
                .map((g) => `${g.first_name} ${g.last_name}`)
                .join(", ")}
            </span>
          </div>
        </div>
      )}

      <div className="tabs">
        {statusFilters.map((f) => (
          <button
            key={f}
            className={`tab-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "alle" ? "Alle" : statusInfo[f as CustomerStatus].label}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Zoek op naam of email..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1px solid var(--border)",
          borderRadius: "var(--rs)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          marginBottom: 16,
          background: "var(--white)",
        }}
      />

      {loading ? (
        <div className="data-table" style={{ padding: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 16, padding: "10px 0" }}
            >
              <Skeleton height={16} width="20%" />
              <Skeleton height={16} width="25%" />
              <Skeleton height={16} width="8%" />
              <Skeleton height={16} width="12%" />
              <Skeleton height={16} width="10%" />
              <Skeleton height={16} width="10%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : filtered.length === 0 ? (
        query.trim() || filter !== "alle" ? (
          <div className="table-empty">Geen gasten gevonden.</div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">Nog geen gasten</div>
            <div className="empty-desc">
              Importeer vanuit je reserveringsplatform of voeg handmatig toe.
            </div>
            <button className="btn-primary-dash">Gast toevoegen</button>
          </div>
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {/* Via Filly bewust als eerste kolom zodat attributie
                  meteen in het oog springt. Smalle breedte + badge-
                  achtige weergave (groene vinkje of streepje) zodat
                  de tabel niet te veel kolombreedte verliest aan
                  een ja/nee-waarde. */}
              <th style={{ width: 90 }}>Via Filly</th>
              <th>Naam</th>
              <th>Status</th>
              <th>Bezoeken</th>
              <th>LTV</th>
              <th>Laatste bezoek</th>
              <th>Opt-in</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const status = computeCustomerStatus(g);
              const info = statusInfo[status];
              const allergies = g.preferences?.allergies ?? [];
              const fromFilly = isFromFilly(g);
              return (
                <tr key={g.id}>
                  {/* Via Filly-kolom: groene badge + "Ja" als het via
                      een Filly-campagne binnenkwam, anders een rustig
                      streepje. Badge-stijl matcht de rest van het
                      dashboard (brand-groen = Filly-attributie). */}
                  <td>
                    {fromFilly ? (
                      <span
                        title="Binnengekomen via een Filly-campagne"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 10px",
                          borderRadius: "var(--rf)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--accent, #1F4A2D)",
                          background: "var(--accent-light, #D6E0D8)",
                        }}
                      >
                        ✓ Ja
                      </span>
                    ) : (
                      <span
                        style={{
                          color: "var(--tl)",
                          fontSize: 12,
                        }}
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {allergies.length > 0 && (
                        <span
                          title={`Allergieën: ${allergies.join(", ")}`}
                          style={{
                            fontSize: 12,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "#FEE2E2",
                            color: "#B91C1C",
                            fontWeight: 600,
                          }}
                        >
                          ⚠ {allergies[0]}
                        </span>
                      )}
                      <div>
                        <div
                          style={{
                            fontWeight: 500,
                          }}
                        >
                          {g.first_name} {g.last_name}
                        </div>
                        <div style={{ color: "var(--tl)", fontSize: 11 }}>
                          {g.email ?? "—"}
                        </div>
                      </div>
                    </div>
                    {g.notes && (
                      <div
                        style={{
                          color: "var(--ts)",
                          fontSize: 11,
                          marginTop: 3,
                          fontStyle: "italic",
                        }}
                      >
                        {g.notes}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "var(--rf)",
                        fontSize: 11,
                        fontWeight: 500,
                        color: info.color,
                        background: info.bg,
                      }}
                    >
                      {info.label}
                    </span>
                  </td>
                  <td>{g.visit_count}</td>
                  <td style={{ fontWeight: 500 }}>
                    {formatEuro(g.lifetime_value_cents)}
                  </td>
                  <td style={{ color: "var(--tl)" }}>
                    {formatDate(g.last_visit_at)}
                  </td>
                  <td>
                    {g.mail_opt_in ? (
                      <span style={{ color: "#1B7A2E" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--tl)" }}>—</span>
                    )}
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
