"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchDeletedCampaigns,
  restoreCampaignFromHistory,
  type Campaign,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

// ============================================================
// /dashboard/campagnes/history — archief
// ============================================================
// Sinds Floris-redesign 2026-05-12: hoofdpagina /campagnes is een
// kanban met 4 actieve fases. Voltooide en verwijderde campagnes
// verhuizen hierheen zodat de kanban niet vol-loopt met historie.
//
// Twee tabs:
//   - Afgerond  : status='afgerond' OF scheduled_for < nu (voor
//                 campagnes die nog niet door pg_cron-job 0043
//                 zijn opgepakt). Sortering op scheduled_for desc.
//   - Verwijderd: deleted_at IS NOT NULL (mig 0040), sortering op
//                 deleted_at desc
//
// Per 2026-05-21 (Floris-feedback): Afgerond-rijen krijgen een
// '↺ Terugzetten'-knop die een modal opent met een datum-picker
// + status-keuze (concept/ingepland/actief). Backend valideert
// dat de nieuwe datum in de toekomst ligt.

type ArchiveTab = "afgerond" | "verwijderd";
type RestoreStatus = "concept" | "ingepland" | "actief";

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// HTML <input type="datetime-local"> wil 'YYYY-MM-DDTHH:MM' zonder
// tijdzone-suffix. We gebruiken lokale getters zodat NL-tijd in het
// veld komt te staan (browser-locale = Europe/Amsterdam).
function nowDatetimeLocal(): string {
  const d = new Date();
  // 30 min in de toekomst als sensible default: meeste use-cases
  // zijn "opnieuw vandaag later op de dag".
  d.setMinutes(d.getMinutes() + 30);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampagnesHistoryPage() {
  const [done, setDone] = useState<Campaign[]>([]);
  const [deleted, setDeleted] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ArchiveTab>("afgerond");

  // Restore-modal state: welke campagne, gekozen status, gekozen
  // datum, busy + error. null = modal dicht.
  const [restoringCampaign, setRestoringCampaign] = useState<Campaign | null>(
    null,
  );
  const [draftStatus, setDraftStatus] = useState<RestoreStatus>("ingepland");
  const [draftDatetime, setDraftDatetime] = useState<string>("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    Promise.all([fetchCampaigns(), fetchDeletedCampaigns()])
      .then(([all, del]) => {
        // 'Afgerond'-tab toont 2 categorieën:
        //  1. status='afgerond' (door eigenaar of pg_cron-job 0043 gezet)
        //  2. status !== 'afgerond' MAAR scheduled_for in het verleden
        //     (cron heeft 'm nog niet kunnen migreren). Zo ziet eigenaar
        //     geen "vergeten" actieve campagne met verstreken datum
        //     tussen cron-runs.
        const nowIso = new Date().toISOString();
        const archived = all.filter((c) => {
          if (c.status === "afgerond") return true;
          return (
            typeof c.scheduled_for === "string" && c.scheduled_for < nowIso
          );
        });
        setDone(archived);
        setDeleted(del);
      })
      .catch(() => {
        setDone([]);
        setDeleted([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // Eénmalig bij mount; reload() wordt expliciet aangeroepen na een
    // succesvolle restore zodat de lijst meteen vernieuwt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Klik op de '↺ Terugzetten'-knop in een row. Opent de modal met
  // sensible defaults (status = ingepland, datum = nu + 30 min).
  const openRestore = (c: Campaign) => {
    setRestoringCampaign(c);
    setDraftStatus("ingepland");
    setDraftDatetime(nowDatetimeLocal());
    setRestoreError(null);
  };
  const closeRestore = () => {
    if (restoring) return;
    setRestoringCampaign(null);
    setRestoreError(null);
  };

  const submitRestore = async () => {
    if (!restoringCampaign || restoring) return;
    if (!draftDatetime) {
      setRestoreError("Kies een datum + tijdstip.");
      return;
    }
    // Datetime-local → ISO. Browser interpreteert lokale tijd, .toISOString()
    // converteert naar UTC voor backend.
    const isoUtc = new Date(draftDatetime).toISOString();
    if (Number.isNaN(new Date(isoUtc).getTime())) {
      setRestoreError("Ongeldige datum.");
      return;
    }
    if (new Date(isoUtc).getTime() <= Date.now()) {
      setRestoreError("Nieuwe datum moet in de toekomst liggen.");
      return;
    }
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreCampaignFromHistory(
        restoringCampaign.id,
        draftStatus,
        isoUtc,
      );
      setRestoringCampaign(null);
      // Lijst opnieuw ophalen zodat de teruggezette campagne uit
      // history verdwijnt en (via /campagnes) in de kanban verschijnt.
      reload();
    } catch (e) {
      setRestoreError(
        e instanceof Error ? e.message : "Terugzetten mislukt.",
      );
    } finally {
      setRestoring(false);
    }
  };

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
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 14,
                  padding: "14px 18px",
                  alignItems: "center",
                  borderTop:
                    idx === 0
                      ? "none"
                      : "1px solid var(--border-soft, #E5DFD0)",
                  opacity: isDeleted ? 0.85 : 1,
                }}
              >
                {/* Klikbare titel + datum: link naar detail-pagina.
                    Apart Link-element zodat de ↺-knop ernaast NIET
                    ook navigeert. */}
                <Link
                  href={`/dashboard/campagnes/${c.id}`}
                  style={{
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
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
                </Link>
                {/* Stats-cel: alleen voor Afgerond + als de extra-
                    reserveringen-stat ingevuld is. */}
                <div style={{ fontSize: 12, color: "var(--tl)" }}>
                  {!isDeleted && stats.extra_reservations != null ? (
                    <>+{stats.extra_reservations} reserveringen</>
                  ) : null}
                </div>
                {/* '↺ Terugzetten'-knop: alleen op Afgerond-tab. De
                    Verwijderd-tab heeft een eigen restore-flow (nog
                    niet gebouwd; komt later via deleted_at = null). */}
                {!isDeleted && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openRestore(c)}
                  >
                    ↺ Terugzetten
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================
          Restore-modal
          ============================================================ */}
      {restoringCampaign && (
        <div
          onClick={closeRestore}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--white, #FFFFFF)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 18,
                marginBottom: 4,
                color: "var(--text, #18181B)",
              }}
            >
              Campagne terugzetten
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--tl)",
                marginBottom: 20,
              }}
            >
              {restoringCampaign.name}
            </div>

            {/* Status-keuze: 3 radio's. Default ingepland (meest
                gebruikte use-case: opnieuw inplannen). */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "var(--text, #18181B)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Naar welke fase?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["concept", "ingepland", "actief"] as RestoreStatus[]).map(
                  (s) => (
                    <label
                      key={s}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        padding: "8px 10px",
                        border:
                          draftStatus === s
                            ? "1.5px solid var(--accent, #1F4A2D)"
                            : "1px solid var(--border, #E5DFD0)",
                        background:
                          draftStatus === s
                            ? "var(--brand-soft, #EDF3EE)"
                            : "transparent",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        name="restore-status"
                        value={s}
                        checked={draftStatus === s}
                        onChange={() => setDraftStatus(s)}
                      />
                      <span style={{ fontWeight: 600 }}>
                        {s === "concept" && "Concept — verder bewerken"}
                        {s === "ingepland" && "Ingepland — klaar voor de gekozen datum"}
                        {s === "actief" && "Actief — direct versturen op gekozen datum"}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>

            {/* Datum-picker. min = nu zodat de browser standaard al
                'verleden' uitsluit (extra defense-in-depth boven de
                backend-validatie). */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "var(--text, #18181B)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Nieuwe datum + tijdstip
              </div>
              <input
                type="datetime-local"
                value={draftDatetime}
                min={minDatetimeLocal()}
                onChange={(e) => setDraftDatetime(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 8,
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--tl)",
                  marginTop: 6,
                }}
              >
                Moet in de toekomst liggen — vandaag op een later
                tijdstip mag ook.
              </div>
            </div>

            {restoreError && (
              <div
                style={{
                  padding: "8px 12px",
                  marginBottom: 12,
                  background: "var(--red-soft, #fee)",
                  color: "var(--red, #b00)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {restoreError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <Button
                variant="ghost"
                onClick={closeRestore}
                disabled={restoring}
              >
                Annuleren
              </Button>
              <Button
                variant="primary"
                onClick={submitRestore}
                loading={restoring}
              >
                Terugzetten
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
