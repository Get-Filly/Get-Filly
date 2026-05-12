"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchCampaigns,
  type Campaign,
} from "../../../../lib/api";
import { PageHeader } from "../../../../components/ui/page-header";
import { EmptyState } from "../../../../components/ui/empty-state";

// ============================================================
// /dashboard/campagnes/history — voltooide campagnes
// ============================================================
// Sinds Floris-redesign 2026-05-12: hoofdpagina /campagnes is een
// kanban met 4 actieve fases (Voorstel/Concept/Ingepland/Actief).
// Voltooide campagnes verhuizen hierheen zodat de kanban niet
// vol-loopt met historische items.

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function typeIcon(t: Campaign["type"]): string {
  if (t === "mail") return "✉️";
  if (t === "whatsapp") return "💬";
  return "📱";
}

export default function CampagnesHistoryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns()
      .then((c) =>
        setCampaigns(c.filter((x) => x.status === "afgerond")),
      )
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, []);

  // Sorteer op scheduled_for (recent eerst).
  const sorted = [...campaigns].sort((a, b) => {
    const aDate = a.scheduled_for ?? "";
    const bDate = b.scheduled_for ?? "";
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="page-full">
      <Link
        href="/dashboard/campagnes"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--tl)",
          textDecoration: "none",
          marginBottom: 8,
        }}
      >
        ← Terug naar campagnes
      </Link>
      <PageHeader title="Campagne-historie" />

      {loading ? (
        <div style={{ color: "var(--tl)", fontSize: 13 }}>Laden…</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Nog geen voltooide campagnes"
          description="Zodra een campagne afgerond is verschijnt 'ie hier. Loop terug naar de campagnes-pagina voor lopende en geplande campagnes."
        />
      ) : (
        <div
          style={{
            background: "var(--white, #FFFFFF)",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {sorted.map((c, idx) => {
            const stats = c.result_stats ?? {};
            return (
              <Link
                key={c.id}
                href={`/dashboard/campagnes/${c.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto auto",
                  gap: 14,
                  padding: "14px 18px",
                  alignItems: "center",
                  borderTop:
                    idx === 0 ? "none" : "1px solid var(--border-soft, #E5DFD0)",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 20, lineHeight: 1 }}>
                  {typeIcon(c.type)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--text, #18181B)",
                      marginBottom: 2,
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tl)" }}>
                    {c.type} · {formatDate(c.scheduled_for)}
                  </div>
                </div>
                {stats.extra_reservations != null && (
                  <div style={{ fontSize: 12, color: "var(--tl)" }}>
                    +{stats.extra_reservations} reserveringen
                  </div>
                )}
                <div
                  style={{
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    background: "#F4F4F5",
                    color: "#52525B",
                    borderRadius: 999,
                  }}
                >
                  Afgerond
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
