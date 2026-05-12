"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaigns,
  fetchGuests,
  fetchReservations,
  setReservationAttribution,
  setReservationStatus,
  type Campaign,
  type Guest,
  type Reservation,
  type ReservationStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";
import { Button } from "../../../components/ui/button";
import { PageHeader } from "../../../components/ui/page-header";
import { EmptyState } from "../../../components/ui/empty-state";
import { Tabs } from "../../../components/ui/tabs";

const statusInfo: Record<ReservationStatus, { label: string; color: string; bg: string }> = {
  bevestigd: { label: "Bevestigd", color: "#1B7A2E", bg: "#DCFCE7" },
  ingecheckt: { label: "Ingecheckt", color: "#1F4A2D", bg: "#D6E0D8" },
  voltooid: { label: "Voltooid", color: "#52525B", bg: "#F4F4F5" },
  no_show: { label: "No-show", color: "#B91C1C", bg: "#FEE2E2" },
  geannuleerd: { label: "Geannuleerd", color: "#71717A", bg: "#F4F4F5" },
};

type StatusFilter = "alle" | ReservationStatus;

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "bevestigd", label: "Bevestigd" },
  { key: "ingecheckt", label: "Ingecheckt" },
  { key: "voltooid", label: "Voltooid" },
  { key: "no_show", label: "No-show" },
  { key: "geannuleerd", label: "Geannuleerd" },
];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Vandaag";
  if (diffDays === 1) return "Morgen";
  if (diffDays === -1) return "Gisteren";
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ============================================================
// exportGuestsToCsv, download gast-lijst als CSV
// ============================================================
// Excel-friendly: BOM-prefix zodat ä/é/etc niet als rommel verschijnen
// bij dubbelklik in Excel. Quote-escape per cel zodat komma's of
// regel-eindes in een notitie de CSV niet breken.
function exportGuestsToCsv(guests: Guest[]) {
  if (guests.length === 0) return;
  const headers = [
    "Naam",
    "Email",
    "Telefoon",
    "Bezoeken",
    "Laatste bezoek",
    "Verjaardag",
    "Tags",
    "Mail-opt-in",
  ];
  const rows = guests.map((g) => {
    const name = [g.first_name, g.last_name].filter(Boolean).join(" ") || "—";
    const lastVisit = g.last_visit_at
      ? new Date(g.last_visit_at).toISOString().slice(0, 10)
      : "";
    return [
      name,
      g.email ?? "",
      g.phone ?? "",
      String(g.visit_count),
      lastVisit,
      g.birthday ?? "",
      (g.tags ?? []).join("; "),
      g.mail_opt_in ? "ja" : "nee",
    ];
  });
  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((r) => r.map(escape).join(","))
    .join("\n");

  // BOM (﻿) zorgt dat Excel UTF-8 herkent.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `klanten-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReserveringenPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Gast-map keyed op guest.id zodat we per reservering snel visit_count
  // en last_visit_at kunnen opzoeken zonder N+1 queries.
  const [guestsById, setGuestsById] = useState<Map<string, Guest>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  // Tijdens een attributie-PATCH zetten we de reservation-id hier zodat
  // de UI kan disablen + een spinner kan tonen.
  const [attributing, setAttributing] = useState<string | null>(null);
  // Idem voor status-mutatie (Inchecken-knop).
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  // Datum-range voor de reservering-lijst. Default: 3 dgn geleden t/m
  // 14 dgn vooruit (zelfde als vroeger). Eigenaar kan in de filter-rij
  // zelf andere datums kiezen.
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  // Campagnes + gasten: 1× ophalen bij mount, blijft hetzelfde
  // ongeacht datum-filter.
  useEffect(() => {
    Promise.all([fetchCampaigns(), fetchGuests()])
      .then(([camps, guests]) => {
        setCampaigns(camps);
        const map = new Map<string, Guest>();
        for (const g of guests) map.set(g.id, g);
        setGuestsById(map);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Reserveringen: opnieuw fetchen wanneer eigenaar datum-range wisselt.
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    fetchReservations(dateFrom, dateTo)
      .then((res) => {
        setReservations(res);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [dateFrom, dateTo]);

  // Inchecken-handler: zet status van 'bevestigd' → 'ingecheckt'.
  // Optimistisch updaten, rollback bij fout.
  const handleCheckIn = async (reservationId: string) => {
    const original = reservations.find((r) => r.id === reservationId);
    if (!original) return;
    setStatusBusy(reservationId);
    setReservations((prev) =>
      prev.map((r) =>
        r.id === reservationId ? { ...r, status: "ingecheckt" } : r,
      ),
    );
    try {
      await setReservationStatus(reservationId, "ingecheckt");
    } catch (e) {
      setReservations((prev) =>
        prev.map((r) => (r.id === reservationId ? original : r)),
      );
      alert(
        e instanceof Error
          ? e.message
          : "Inchecken mislukt. Probeer opnieuw.",
      );
    } finally {
      setStatusBusy(null);
    }
  };

  // Handler voor het wijzigen van de attributie. Optimistisch updaten:
  // we vervangen de rij meteen in lokale state, doen daarna de PATCH;
  // bij fout zetten we 'm terug en tonen een alert. Snelle UX.
  const handleAttributionChange = async (
    reservationId: string,
    campaignId: string | null,
  ) => {
    const original = reservations.find((r) => r.id === reservationId);
    if (!original) return;

    setAttributing(reservationId);
    setReservations((prev) =>
      prev.map((r) =>
        r.id === reservationId ? { ...r, via_campaign_id: campaignId } : r,
      ),
    );
    try {
      await setReservationAttribution(reservationId, campaignId);
    } catch (e) {
      // Rollback bij fout zodat lokale state weer overeenkomt met DB.
      setReservations((prev) =>
        prev.map((r) => (r.id === reservationId ? original : r)),
      );
      alert(
        e instanceof Error
          ? e.message
          : "Koppelen mislukt. Probeer opnieuw.",
      );
    } finally {
      setAttributing(null);
    }
  };

  // Filter + zoek. Query matcht op naam, telefoon of mail, typisch
  // wat een medewerker tikt als hij/zij iemand zoekt ("Jansen", of
  // het laatste stuk van een telefoonnummer).
  const filtered = useMemo(() => {
    let out = reservations;
    if (statusFilter !== "alle") {
      out = out.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        `${r.guest_name ?? ""} ${r.guest_phone ?? ""} ${r.guest_email ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    return out;
  }, [reservations, statusFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of filtered) {
      if (!map.has(r.reservation_date)) map.set(r.reservation_date, []);
      map.get(r.reservation_date)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);


  return (
    <div className="page-full">
      <PageHeader
        title="Reserveringen"
        actions={
          <Button
            variant="primary"
            onClick={() => exportGuestsToCsv(Array.from(guestsById.values()))}
            disabled={guestsById.size === 0}
          >
            ⬇ Exporteer klanten
          </Button>
        }
      />

      {/* Filter-/zoekrij + datum-range. Floris-keuze 2026-05-12:
          stats-row eruit, datums kunnen zelf gekozen worden. */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <Tabs
          items={statusFilters.map((f) => ({ key: f.key, label: f.label }))}
          active={statusFilter}
          onChange={setStatusFilter}
          className="tabs--inline"
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--tl)",
          }}
        >
          <span>Periode:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <span>tot</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
        </div>
      </div>

      <input
        type="search"
        placeholder="Zoek op naam, telefoon of mail..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
      />

      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={80} style={{ marginBottom: 10 }} />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        query.trim() || statusFilter !== "alle" ? (
          <div className="table-empty">
            Geen reserveringen gevonden met deze filters.
          </div>
        ) : (
          // Foutstatus valt in dezelfde empty-state, alleen met andere
          // subcopy. Rode HTTP-meldingen zijn voor de eindgebruiker
          // betekenisloos, de dev-console houdt alles vast.
          <EmptyState
            icon="📆"
            title={
              error ? "Reserveringen niet geladen" : "Geen reserveringen"
            }
            description={
              error
                ? "We konden de lijst niet ophalen. Probeer de pagina te herladen."
                : "Koppel een reserveringsplatform om reserveringen automatisch te importeren."
            }
          />
        )
      ) : (
        <div>
          {grouped.map(([date, list]) => {
            const dayLabel = formatDayLabel(date);
            const dayCovers = list
              .filter((r) => r.status === "bevestigd")
              .reduce((s, r) => s + r.party_size, 0);
            return (
              <div key={date} style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {dayLabel}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tl)" }}>
                    {list.length} reservering{list.length > 1 ? "en" : ""} ·{" "}
                    {dayCovers} covers
                  </div>
                </div>
                <div
                  style={{
                    background: "var(--white)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    overflow: "hidden",
                  }}
                >
                  {list.map((r, idx) => {
                    const info = statusInfo[r.status];
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "80px 1fr auto auto auto",
                          gap: 14,
                          padding: "14px 18px",
                          borderTop:
                            idx === 0 ? "none" : "1px solid var(--border-soft)",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {r.reservation_time.slice(0, 5)}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{r.guest_name ?? "—"}</span>
                            <span
                              style={{
                                color: "var(--tl)",
                                fontWeight: 400,
                                fontSize: 12,
                              }}
                            >
                              · {r.party_size} pers
                            </span>
                          </div>
                          <div style={{ color: "var(--tl)", fontSize: 11 }}>
                            {r.guest_phone ?? "—"}
                            {r.source && ` · via ${r.source}`}
                            {r.table_code && ` · tafel ${r.table_code}`}
                          </div>
                          {/* Gast-stats: totaal bezoeken + laatste bezoek.
                              Alleen tonen als de reservering aan een gast
                              gekoppeld is én we de gast-data hebben.
                              "Nieuwe gast" wanneer visit_count = 0/1. */}
                          {r.guest_id && guestsById.has(r.guest_id) && (() => {
                            const g = guestsById.get(r.guest_id)!;
                            const lastVisit = g.last_visit_at
                              ? new Date(g.last_visit_at).toLocaleDateString(
                                  "nl-NL",
                                  { day: "numeric", month: "short" },
                                )
                              : null;
                            const isNew = g.visit_count <= 1;
                            return (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--tl)",
                                  marginTop: 4,
                                  display: "flex",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>
                                  🔁 {g.visit_count}
                                  {g.visit_count === 1 ? " bezoek" : " bezoeken"}
                                  {isNew && (
                                    <span
                                      style={{
                                        marginLeft: 4,
                                        color: "var(--accent, #1F4A2D)",
                                        fontWeight: 500,
                                      }}
                                    >
                                      · Nieuwe gast
                                    </span>
                                  )}
                                </span>
                                {lastVisit && (
                                  <span>📅 Laatste: {lastVisit}</span>
                                )}
                              </div>
                            );
                          })()}
                          {r.special_requests && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#B45309",
                                background: "#FEF3C7",
                                padding: "2px 8px",
                                borderRadius: 4,
                                marginTop: 4,
                                display: "inline-block",
                              }}
                            >
                              💬 {r.special_requests}
                            </div>
                          )}
                        </div>

                        {/* Filly-attributie: dropdown om handmatig aan
                            een campagne te koppelen. Als gekoppeld: groene
                            badge met campagnenaam + "x"-knop om los te
                            koppelen. Tot send-engine click-tracking
                            heeft, is dit de manier om Filly-ROI-cijfers
                            in het dashboard te krijgen. */}
                        <FillyAttributionControl
                          reservation={r}
                          campaigns={campaigns}
                          busy={attributing === r.id}
                          onChange={(campId) =>
                            handleAttributionChange(r.id, campId)
                          }
                        />

                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: "var(--rf)",
                            fontSize: 11,
                            fontWeight: 500,
                            color: info.color,
                            background: info.bg,
                          }}
                        >
                          {info.label}
                        </span>
                        {/* Inchecken-knop: alleen tonen voor 'bevestigd'-
                            status. Klik = PATCH naar status='ingecheckt'.
                            Optimistic update + rollback in handleCheckIn. */}
                        {r.status === "bevestigd" ? (
                          <button
                            className="sg-btn primary"
                            disabled={statusBusy === r.id}
                            onClick={() => handleCheckIn(r.id)}
                            style={{ padding: "4px 12px", fontSize: 11 }}
                          >
                            {statusBusy === r.id ? "..." : "Inchecken"}
                          </button>
                        ) : (
                          <div style={{ width: 78 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}


// ============================================================
// FillyAttributionControl, koppel reservering aan campagne
// ============================================================
// Twee modi:
//   - Niet gekoppeld → kleine "+ Filly"-button die een dropdown
//     opent met alle campagnes van het restaurant.
//   - Wel gekoppeld → groene badge met campagnenaam + "×"-knop om
//     te ontkoppelen.
//
// Dropdown filtert op niet-gearchiveerde campagnes (afgerond + actief
// + ingepland + concept) zodat oude testcampagnes niet blijven hangen.
function FillyAttributionControl({
  reservation,
  campaigns,
  busy,
  onChange,
}: {
  reservation: Reservation;
  campaigns: Campaign[];
  busy: boolean;
  onChange: (campaignId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const linkedCampaign = reservation.via_campaign_id
    ? campaigns.find((c) => c.id === reservation.via_campaign_id)
    : null;

  if (linkedCampaign) {
    return (
      <span
        title={`Toegeschreven aan campagne: ${linkedCampaign.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 4px 2px 10px",
          borderRadius: "var(--rf)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--accent, #1F4A2D)",
          background: "var(--accent-light, #D6E0D8)",
          maxWidth: 200,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ✓ {linkedCampaign.name}
        </span>
        <button
          onClick={() => onChange(null)}
          disabled={busy}
          aria-label="Loskoppelen van campagne"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent, #1F4A2D)",
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </span>
    );
  }

  if (campaigns.length === 0) {
    // Geen campagnes om aan te koppelen, niet relevant om de knop
    // te tonen. Eigenaar moet eerst een campagne aanmaken.
    return null;
  }

  if (open) {
    return (
      <select
        autoFocus
        defaultValue=""
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value;
          setOpen(false);
          if (v) onChange(v);
        }}
        onBlur={() => setOpen(false)}
        style={{
          padding: "2px 6px",
          fontSize: 11,
          border: "1px solid var(--accent, #1F4A2D)",
          borderRadius: 6,
          maxWidth: 200,
        }}
      >
        <option value="" disabled>
          Kies campagne…
        </option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      disabled={busy}
      style={{
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--ts)",
        background: "transparent",
        border: "1px dashed var(--border, #E5DFD0)",
        borderRadius: "var(--rf)",
        cursor: busy ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
      title="Koppel deze reservering aan een Filly-campagne"
    >
      + Filly-koppeling
    </button>
  );
}

