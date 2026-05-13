"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchDeletedCampaigns,
  type Campaign,
} from "../../../../lib/api";
import { PageHeader } from "../../../../components/ui/page-header";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Tabs } from "../../../../components/ui/tabs";

// ============================================================
// /dashboard/campagnes/history — archief
// ============================================================
// Sinds Floris-redesign 2026-05-12: hoofdpagina /campagnes is een
// kanban met 4 actieve fases. Voltooide en verwijderde campagnes
// verhuizen hierheen zodat de kanban niet vol-loopt met historie.
//
// Twee tabs:
//   - Afgerond  : status='afgerond', sortering op scheduled_for desc
//   - Verwijderd: deleted_at IS NOT NULL (mig 0040), sortering op
//                 deleted_at desc
//
// Beide tabs gebruiken dezelfde row-rendering; alleen de status-pill
// rechts verschilt + de datum-bron (verzonden-moment vs. verwijder-
// moment).

type ArchiveTab = "afgerond" | "verwijderd";

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CampagnesHistoryPage() {
  const [done, setDone] = useState<Campaign[]>([]);
  const [deleted, setDeleted] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ArchiveTab>("afgerond");

  useEffect(() => {
    // Beide lijsten parallel ophalen zodat tab-switch direct snel is.
    Promise.all([fetchCampaigns(), fetchDeletedCampaigns()])
      .then(([all, del]) => {
        setDone(all.filter((c) => c.status === "afgerond"));
        setDeleted(del);
      })
      .catch(() => {
        setDone([]);
        setDeleted([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Sorteer per tab op de juiste datum-kolom (verzonden vs. verwijderd).
  const doneSorted = useMemo(() => {
    return [...done].sort((a, b) => {
      const aDate = a.scheduled_for ?? "";
      const bDate = b.scheduled_for ?? "";
      return bDate.localeCompare(aDate);
    });
  }, [done]);
  const deletedSorted = useMemo(() => {
    return [...deleted].sort((a, b) => {
      const aDate = a.deleted_at ?? "";
      const bDate = b.deleted_at ?? "";
      return bDate.localeCompare(aDate);
    });
  }, [deleted]);

  const rows = tab === "afgerond" ? doneSorted : deletedSorted;

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

      <Tabs<ArchiveTab>
        items={[
          { key: "afgerond", label: "Afgerond", count: done.length },
          { key: "verwijderd", label: "Verwijderd", count: deleted.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <div style={{ color: "var(--tl)", fontSize: 13, marginTop: 16 }}>
          Laden…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          {tab === "afgerond" ? (
            <EmptyState
              icon="📦"
              title="Nog geen voltooide campagnes"
              description="Zodra een campagne afgerond is verschijnt 'ie hier. Loop terug naar de campagnes-pagina voor lopende en geplande campagnes."
            />
          ) : (
            <EmptyState
              icon="🗑"
              title="Nog niks verwijderd"
              description="Verwijderde concept- of geplande campagnes komen hier terecht. Zo kun je later nakijken wat er weg is gegooid."
            />
          )}
        </div>
      ) : (
        <div
          style={{
            background: "var(--white, #FFFFFF)",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 8,
            overflow: "hidden",
            marginTop: 16,
          }}
        >
          {rows.map((c, idx) => {
            const stats = c.result_stats ?? {};
            const isDeleted = tab === "verwijderd";
            // Verwijderde campagnes: datum = wanneer-weggegooid. Voor
            // afgerond: scheduled_for (= verzonden-moment).
            const dateText = isDeleted
              ? `Verwijderd op ${formatDate(c.deleted_at)}`
              : `${c.type} · ${formatDate(c.scheduled_for)}`;
            return (
              <Link
                key={c.id}
                href={`/dashboard/campagnes/${c.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 14,
                  padding: "14px 18px",
                  alignItems: "center",
                  borderTop:
                    idx === 0
                      ? "none"
                      : "1px solid var(--border-soft, #E5DFD0)",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                  opacity: isDeleted ? 0.85 : 1,
                }}
              >
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
                    {dateText}
                  </div>
                </div>
                {!isDeleted && stats.extra_reservations != null && (
                  <div style={{ fontSize: 12, color: "var(--tl)" }}>
                    +{stats.extra_reservations} reserveringen
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

