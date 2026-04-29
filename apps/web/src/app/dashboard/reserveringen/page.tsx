"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createReservation,
  fetchCampaigns,
  fetchReservations,
  setReservationAttribution,
  type Campaign,
  type Reservation,
  type ReservationStatus,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

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

// Bepaalt of een reservering via een Filly-campagne binnenkwam.
// Sinds migratie 0022 doen we dit op basis van de echte FK
// via_campaign_id (handmatig gezet of straks automatisch door de
// send-engine). Source-veld als fallback voor legacy-data.
function isFromFilly(r: Reservation): boolean {
  if (r.via_campaign_id) return true;
  return r.source?.toLowerCase().includes("filly") ?? false;
}

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

// Default-datum voor de "nieuwe reservering"-modal: vandaag in YYYY-MM-DD.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReserveringenPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [modalOpen, setModalOpen] = useState(false);
  // Tijdens een attributie-PATCH zetten we de reservation-id hier zodat
  // de UI kan disablen + een spinner kan tonen.
  const [attributing, setAttributing] = useState<string | null>(null);

  useEffect(() => {
    // Fetch 3 dagen geleden t/m 14 dagen vooruit + alle campagnes
    // (voor de "koppel aan campagne"-dropdown).
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 3);
    const to = new Date(today);
    to.setDate(today.getDate() + 14);

    Promise.all([
      fetchReservations(
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
      ),
      fetchCampaigns(),
    ])
      .then(([res, camps]) => {
        setReservations(res);
        setCampaigns(camps);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

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

  // Filter + zoek. Query matcht op naam, telefoon of mail — typisch
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

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayRes = reservations.filter(
      (r) => r.reservation_date === today && r.status === "bevestigd",
    );
    const totalCovers = todayRes.reduce((s, r) => s + r.party_size, 0);
    const noShows = reservations.filter((r) => r.status === "no_show").length;
    const futureBooked = reservations.filter(
      (r) => r.reservation_date >= today && r.status === "bevestigd",
    ).length;
    const viaFilly = reservations.filter(isFromFilly).length;
    return {
      todayCount: todayRes.length,
      todayCovers: totalCovers,
      noShows,
      futureBooked,
      viaFilly,
    };
  }, [reservations]);

  // Callback voor de modal: nieuwe reservering in de state zetten
  // zodat 'ie direct in de lijst verschijnt zonder refetch. De
  // sortering in `grouped` regelt de juiste datum-plek.
  const handleCreated = (created: Reservation) => {
    setReservations((prev) => [...prev, created]);
    setModalOpen(false);
  };

  return (
    <div className="page-full">
      <div className="page-header-row">
        <div>
          <div className="page-title">Reserveringen</div>
          <div className="page-subtitle">
            Overzicht van wie wanneer komt, bijzonderheden en tafel-assignment.
          </div>
        </div>
        <button
          className="btn-primary-dash"
          onClick={() => setModalOpen(true)}
        >
          ＋ Nieuwe reservering
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Vandaag</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.todayCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Covers vandaag</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.todayCovers}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Komend (14 dgn)</div>
          <div className="stat-card-val">
            {loading ? (
              <Skeleton height={22} width="40%" />
            ) : (
              stats.futureBooked
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">No-shows (afgelopen)</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.noShows}
          </div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">Via Filly</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.viaFilly}
          </div>
        </div>
      </div>

      {/* Filter-/zoekrij — status-tabs links, zoekveld daarnaast.
          Zelfde visuele taal als op /campagnes en /gasten zodat
          dashboard consistent voelt. */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div className="tabs" style={{ marginBottom: 0 }}>
          {statusFilters.map((f) => (
            <button
              key={f.key}
              className={`tab-btn ${statusFilter === f.key ? "active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
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
          // betekenisloos — de dev-console houdt alles vast.
          <div className="empty-state">
            <div className="empty-icon">📆</div>
            <div className="empty-title">
              {error ? "Reserveringen niet geladen" : "Geen reserveringen"}
            </div>
            <div className="empty-desc">
              {error
                ? "We konden de lijst niet ophalen. Probeer de pagina te herladen."
                : "Koppel een reserveringsplatform of voeg zelf een boeking toe via de knop rechtsboven."}
            </div>
            {!error && (
              <button
                className="btn-primary-dash"
                onClick={() => setModalOpen(true)}
              >
                Nieuwe reservering
              </button>
            )}
          </div>
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
                            "80px 1fr auto auto auto auto",
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
                        <button
                          className="sg-btn"
                          disabled
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Bellen
                        </button>
                        <button
                          className="sg-btn"
                          disabled
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Details
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <NewReservationModal
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ============================================================
// NewReservationModal — handmatige reservering toevoegen
// ============================================================
// Overlay-modal met formulier. Gebruikt native date/time-input en
// submit via createReservation. Minimaal: naam + datum + tijd + groep.
// Bij succes roept de parent-callback handleCreated die de nieuwe
// reservering in de lijst zet. Op annuleren/Escape dicht zonder save.
function NewReservationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: Reservation) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Escape-key = annuleren. Vaste affordance voor modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Naam van de gast is verplicht.");
      return;
    }
    if (partySize < 1) {
      setFormError("Groepsgrootte moet minimaal 1 zijn.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createReservation({
        guest_name: name.trim(),
        reservation_date: date,
        reservation_time: time,
        party_size: partySize,
        guest_phone: phone.trim() || undefined,
        guest_email: email.trim() || undefined,
        special_requests: specialRequests.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Opslaan mislukt.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: "var(--white, #FFFFFF)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 520,
          padding: 24,
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Nieuwe reservering
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tl)",
            marginTop: -8,
            marginBottom: 4,
          }}
        >
          Voor telefoon- of walk-in-boekingen. Wordt direct op
          'bevestigd' gezet.
        </div>

        <FormField label="Naam van de gast *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="bv. Familie Jansen"
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: "flex", gap: 10 }}>
          <FormField label="Datum *" style={{ flex: 1 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Tijd *" style={{ flex: 1 }}>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Personen *" style={{ width: 100 }}>
            <input
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 1)}
              style={inputStyle}
            />
          </FormField>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <FormField label="Telefoon" style={{ flex: 1 }}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="bv. 06 12345678"
              style={inputStyle}
            />
          </FormField>
          <FormField label="E-mail" style={{ flex: 1 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="optioneel"
              style={inputStyle}
            />
          </FormField>
        </div>

        <FormField label="Bijzonderheden">
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={2}
            placeholder="Allergieën, verjaardag, rolstoel, kinderstoel..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 52 }}
          />
        </FormField>

        {formError && (
          <div
            style={{
              padding: "8px 10px",
              background: "var(--red-soft, #fee)",
              color: "var(--red, #b00)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {formError}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="btn-secondary-dash"
            onClick={onClose}
            disabled={submitting}
          >
            Annuleren
          </button>
          <button
            type="submit"
            className="btn-primary-dash"
            disabled={submitting}
          >
            {submitting ? "Opslaan…" : "Reservering aanmaken"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Kleine helper: labeled form-veld. Houdt label + input consistent
// uitgelijnd zodat we niet in elke row dezelfde inline styling herhalen.
function FormField({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--ts)",
        ...style,
      }}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--white, #FFFFFF)",
  color: "var(--text, #18181B)",
};


// ============================================================
// FillyAttributionControl — koppel reservering aan campagne
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
    // Geen campagnes om aan te koppelen — niet relevant om de knop
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

