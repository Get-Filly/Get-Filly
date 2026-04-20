"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchGuests, type Guest } from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

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

export default function GastenPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    return { total: guests.length, active90, optIns };
  }, [guests]);

  const filtered = useMemo(() => {
    if (!query.trim()) return guests;
    const q = query.toLowerCase();
    return guests.filter((g) =>
      `${g.first_name ?? ""} ${g.last_name ?? ""} ${g.email ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [guests, query]);

  return (
    <div className="page-full">
      <div className="page-title">Gasten</div>
      <div className="page-subtitle">
        Wie jouw restaurant bezoekt — mailadressen, bezoekfrequentie, tags.
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Totaal gasten</div>
          <div className="stat-card-val">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Actief (90 dgn)</div>
          <div className="stat-card-val">{stats.active90}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Mail opt-ins</div>
          <div className="stat-card-val">{stats.optIns}</div>
        </div>
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
            <div key={i} style={{ display: "flex", gap: 16, padding: "10px 0" }}>
              <Skeleton height={16} width="20%" />
              <Skeleton height={16} width="30%" />
              <Skeleton height={16} width="10%" />
              <Skeleton height={16} width="15%" />
              <Skeleton height={16} width="15%" />
              <Skeleton height={16} width="8%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : filtered.length === 0 ? (
        query.trim() ? (
          <div className="table-empty">
            Geen gasten gevonden voor &quot;{query}&quot;.
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">Nog geen gasten</div>
            <div className="empty-desc">
              Importeer vanuit je reserveringsplatform (Zenchef, OpenTable,
              SevenRooms) of voeg gasten handmatig toe.
            </div>
            <button className="btn-primary-dash">Gast toevoegen</button>
          </div>
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Email</th>
              <th>Bezoeken</th>
              <th>Laatste bezoek</th>
              <th>Tags</th>
              <th>Opt-in</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 500 }}>
                  {g.first_name} {g.last_name}
                </td>
                <td style={{ color: "var(--ts)" }}>{g.email ?? "—"}</td>
                <td>{g.visit_count}</td>
                <td style={{ color: "var(--tl)" }}>
                  {formatDate(g.last_visit_at)}
                </td>
                <td>
                  {g.tags.length === 0 ? (
                    <span style={{ color: "var(--tl)" }}>—</span>
                  ) : (
                    g.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        {t}
                      </span>
                    ))
                  )}
                </td>
                <td>
                  {g.mail_opt_in ? (
                    <span style={{ color: "#1B7A2E" }}>✓</span>
                  ) : (
                    <span style={{ color: "var(--tl)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
