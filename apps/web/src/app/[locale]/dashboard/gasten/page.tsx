"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  fetchGuests,
  type Guest,
  computeCustomerStatus,
  type CustomerStatus,
} from "@/lib/api";
import { Skeleton } from "../_components/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsv, exportPagePdf } from "@/lib/csv-export";
import { useLocaleTag } from "@/lib/locale-format";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null, tag: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(tag, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// exportGuestsToCsv, download gast-lijst als CSV
// ============================================================
// Verhuisd van de reserveringen-pagina (2026-06-11): de klanten-
// export hoort bij de gasten-pagina. De download zelf loopt via de
// gedeelde helper in lib/csv-export (Excel-vriendelijke BOM +
// quote-escaping per cel).
function exportGuestsToCsv(
  guests: Guest[],
  csv: { fileName: string; headers: string[]; yes: string; no: string },
) {
  const headers = csv.headers;
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
      g.mail_opt_in ? csv.yes : csv.no,
    ];
  });
  downloadCsv(csv.fileName, headers, rows);
}

function formatEuro(cents: number | null, tag: string): string {
  if (cents === null) return "—";
  return `€${Math.round(cents / 100).toLocaleString(tag)}`;
}

const statusInfo: Record<
  CustomerStatus,
  { labelKey: string; color: string; bg: string }
> = {
  nieuw: { labelKey: "statusNieuw", color: "#0284C7", bg: "#E0F2FE" },
  vaste_gast: { labelKey: "statusVasteGast", color: "#1B7A2E", bg: "#DCFCE7" },
  vip: { labelKey: "statusVip", color: "#7C2D12", bg: "#FED7AA" },
  at_risk: { labelKey: "statusAtRisk", color: "#B45309", bg: "#FEF3C7" },
  verloren: { labelKey: "statusVerloren", color: "#71717A", bg: "#F4F4F5" },
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
  const t = useTranslations("dash_gasten_page");
  const localeTag = useLocaleTag();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("alle");
  // Ophogen = de gasten-fetch opnieuw triggeren (retry-knop bij fout).
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGuests()
      .then((d) => {
        if (cancelled) return;
        setGuests(d);
        setError(null);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

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
    // Filly-attributie: gasten waarvan de eerste reservering aan een
    // Filly-campagne is gekoppeld (via_campaign_id-FK gevuld).
    const viaFilly = guests.filter(
      (g) => g.acquired_via_campaign_id !== null,
    ).length;
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
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            {/* Export volgt het actieve filter + de zoekterm: wat je
                downloadt is wat je op het scherm ziet. PDF = browser-
                printdialoog ("Bewaar als PDF"). */}
            <Button
              variant="secondary"
              onClick={exportPagePdf}
              disabled={filtered.length === 0}
            >
              🖨 {t("exportPdf")}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                exportGuestsToCsv(filtered, {
                  fileName: t("csvFileName"),
                  headers: [
                    t("csvHeaders.name"),
                    t("csvHeaders.email"),
                    t("csvHeaders.phone"),
                    t("csvHeaders.visits"),
                    t("csvHeaders.lastVisit"),
                    t("csvHeaders.birthday"),
                    t("csvHeaders.tags"),
                    t("csvHeaders.mailOptIn"),
                  ],
                  yes: t("csvYes"),
                  no: t("csvNo"),
                })
              }
              disabled={filtered.length === 0}
            >
              ⬇ {t("exportCsv")}
            </Button>
          </>
        }
      />

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">{t("statTotal")}</div>
          <div className="stat-card-val">{stats.total}</div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">{t("statViaFilly")}</div>
          <div className="stat-card-val">{stats.viaFilly}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statActive90")}</div>
          <div className="stat-card-val">{stats.active90}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statVips")}</div>
          <div className="stat-card-val">{stats.vips}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statAtRisk")}</div>
          <div className="stat-card-val">{stats.atRisk}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statOptIns")}</div>
          <div className="stat-card-val">{stats.optIns}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statTotalLtv")}</div>
          <div className="stat-card-val">{formatEuro(stats.totalLtv, localeTag)}</div>
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
            {t.rich("birthdaysThisMonth", {
              count: stats.birthdaysThisMonth.length,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}{" "}
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
            {f === "alle"
              ? t("filterAll")
              : t(statusInfo[f as CustomerStatus].labelKey)}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder={t("searchPlaceholder")}
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
      ) : filtered.length === 0 ? (
        query.trim() || filter !== "alle" ? (
          <div className="table-empty">{t("noGuestsFound")}</div>
        ) : (
          // Bij lege staat OF fout tonen we dezelfde rustige empty-
          // state. Een rode "Fout: HTTP 403"-banner is voor de eind-
          // gebruiker onbegrijpelijk; eventuele fout staat al in de
          // console voor debugging.
          <EmptyState
            icon="👥"
            title={t("emptyTitle")}
            description={
              error ? t("emptyErrorDescription") : t("emptyDescription")
            }
            action={
              error ? (
                <Button
                  variant="primary"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  {t("retry")}
                </Button>
              ) : (
                <Button variant="primary">{t("addGuest")}</Button>
              )
            }
          />
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {/* "Via Filly" als eerste kolom, gevuld via
                  reservations.via_campaign_id koppeling. Smalle
                  breedte: ja/nee badge of streepje. */}
              <th style={{ width: 90 }}>{t("colViaFilly")}</th>
              <th>{t("colName")}</th>
              <th>{t("colStatus")}</th>
              <th>{t("colVisits")}</th>
              <th>{t("colLtv")}</th>
              <th>{t("colLastVisit")}</th>
              <th>{t("colOptIn")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const status = computeCustomerStatus(g);
              const info = statusInfo[status];
              const allergies = g.preferences?.allergies ?? [];
              const fromFilly = g.acquired_via_campaign_id !== null;
              return (
                <tr key={g.id}>
                  <td>
                    {fromFilly ? (
                      <span
                        title={t("viaFillyTooltip")}
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
                        ✓ {t("viaFillyYes")}
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
                          title={t("allergiesTooltip", {
                            allergies: allergies.join(", "),
                          })}
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
                      {t(info.labelKey)}
                    </span>
                  </td>
                  <td>{g.visit_count}</td>
                  <td style={{ fontWeight: 500 }}>
                    {formatEuro(g.lifetime_value_cents, localeTag)}
                  </td>
                  <td style={{ color: "var(--tl)" }}>
                    {formatDate(g.last_visit_at, localeTag)}
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
