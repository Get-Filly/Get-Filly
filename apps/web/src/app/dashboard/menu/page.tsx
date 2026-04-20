"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMenu, type MenuItem } from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

const categoryOrder = ["voorgerecht", "hoofd", "dessert", "drank", "overig"];

const seasonLabel: Record<string, string> = {
  spring: "Lente",
  summer: "Zomer",
  autumn: "Herfst",
  winter: "Winter",
};

function formatEuroFromCents(cents: number | null): string {
  if (cents === null) return "—";
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMenu()
      .then((d) => {
        setItems(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      const cat = item.category ?? "overig";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    // Sort in logical order
    const sorted = new Map<string, MenuItem[]>();
    for (const c of categoryOrder) {
      if (map.has(c)) sorted.set(c, map.get(c)!);
    }
    // Add any categories not in our predefined order
    for (const [k, v] of map) {
      if (!sorted.has(k)) sorted.set(k, v);
    }
    return sorted;
  }, [items]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      signature: items.filter((i) => i.is_signature).length,
      seasonal: items.filter((i) => i.is_seasonal).length,
      avgPrice:
        items.length > 0
          ? Math.round(
              items.reduce((s, i) => s + (i.price_cents ?? 0), 0) /
                items.length,
            )
          : 0,
    };
  }, [items]);

  return (
    <div className="page-full">
      <div className="page-title">Menu</div>
      <div className="page-subtitle">
        Jouw huidige kaart. Filly gebruikt deze gerechten in campagne-teksten —
        dus &quot;3-gangen met asperges voor €24,50&quot; i.p.v. generieke tekst.
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Totaal gerechten</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Signature dishes</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.signature}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Seizoensgerechten</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.seasonal}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Gem. prijs</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="50%" />
            ) : (
              formatEuroFromCents(stats.avgPrice)
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              height={60}
              style={{ marginBottom: 8 }}
            />
          ))}
        </div>
      ) : error ? (
        <div className="table-empty" style={{ color: "var(--red)" }}>
          Fout: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🍽️</div>
          <div className="empty-title">Nog geen menu</div>
          <div className="empty-desc">
            Voeg gerechten toe zodat Filly ze kan gebruiken in campagnes.
          </div>
          <button className="btn-primary-dash">Gerecht toevoegen</button>
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([cat, list]) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: "var(--tl)",
                  marginBottom: 10,
                }}
              >
                {capitalize(cat)}
              </div>
              <div
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  overflow: "hidden",
                }}
              >
                {list.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 16,
                      padding: "14px 18px",
                      borderTop:
                        idx === 0 ? "none" : "1px solid var(--border-soft)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontWeight: 500, fontSize: 14 }}>
                          {item.name}
                        </span>
                        {item.is_signature && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 8px",
                              borderRadius: "var(--rf)",
                              background: "var(--accent)",
                              color: "var(--white)",
                              textTransform: "uppercase",
                              letterSpacing: "0.3px",
                            }}
                          >
                            Signature
                          </span>
                        )}
                        {item.is_seasonal && item.season && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: "1px 8px",
                              borderRadius: "var(--rf)",
                              background: "var(--accent-light)",
                              color: "var(--accent)",
                            }}
                          >
                            {seasonLabel[item.season]}
                          </span>
                        )}
                        {item.dietary_tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10,
                              padding: "1px 8px",
                              borderRadius: "var(--rf)",
                              background: "var(--bg)",
                              color: "var(--ts)",
                            }}
                          >
                            {t.replace("_", "-")}
                          </span>
                        ))}
                      </div>
                      {item.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--ts)",
                            lineHeight: 1.5,
                          }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        minWidth: 60,
                        textAlign: "right",
                      }}
                    >
                      {formatEuroFromCents(item.price_cents)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
