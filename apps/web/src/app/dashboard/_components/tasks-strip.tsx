"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchOccupancy,
  fetchRestaurant,
  fetchReviews,
  fetchSuggestions,
  type OccupancyDay,
  type Restaurant,
  type Review,
} from "../../../lib/api";
import {
  buildWindowOccupancy,
  isOpenOn,
} from "../../../lib/occupancy-window";
import { SuggestionsPanel } from "./suggestions-panel";

// ============================================================
// TasksStrip, "overige acties" voor Filly's verzamelpagina
// ============================================================
// Compact strookje onder de Filly-voorstellen op /dashboard/campagnes.
// Toont items die handmatige aandacht van de eigenaar vragen.
//
// Per 2026-05-12 (v2): twee categorieën:
//   1. Lage reviews zonder reactie (drempel = restaurant.low_review_threshold)
//   2. Rustige dagen komende 14 dgn (drempel = restaurant.low_occupancy_threshold)
//
// Sluitingsdagen worden expliciet gefilterd via isOpenOn-helper.
// Bezetting via buildWindowOccupancy (real data + seededOccupancy
// fallback) zodat strip consistent is met dashboard-kalender.
//
// Per 2026-05-12 (v3): "X rustige dagen"-kaart toont popover bij klik
// (zelfde card-grootte als de review-kaarten, in dezelfde grid).
// Popover hangt onder de card met SuggestionsPanel — multi-select
// dagen + Filly-genereer-knop. Na succes: router.refresh() zodat de
// nieuwe Filly-voorstellen direct in de bovenste strip verschijnen.

// Window voor lage-bezetting-scan: 14 dgn vooruit, matcht het
// rode-strook-venster op het dashboard zodat eigenaar consistente
// signalen krijgt.
const LOW_OCCUPANCY_WINDOW_DAYS = 14;

type ReviewTask = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  link: string;
};

const URGENCY_RED = "#DC2626";

export function TasksStrip() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  // Pending-low-occupancy target_dates: dagen waarvoor al een Filly-
  // voorstel klaar staat. Worden uit de keuze-lijst + de kaart-tekst
  // gefilterd zodat eigenaar niet per ongeluk dubbele voorstellen
  // genereert. Set voor O(1) lookup.
  const [pendingDates, setPendingDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Popover-state voor de low-occ-kaart. Klik op de card opent 'm,
  // klik buiten of "Annuleren" sluit 'm.
  const [lowOccOpen, setLowOccOpen] = useState(false);
  const lowOccRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We hebben mogelijk 2 maanden bezetting-data nodig: als vandaag
    // bv. 25 mei is, valt 8 juni binnen het 14-daagse venster.
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    Promise.all([
      fetchReviews(),
      fetchOccupancy(now.getFullYear(), now.getMonth()),
      fetchOccupancy(nextMonth.getFullYear(), nextMonth.getMonth()),
      fetchRestaurant(),
      // Pending suggesties ophalen om dagen-met-voorstel uit te
      // sluiten van de keuze-popover. Bij refresh na een succesvolle
      // generate krijgen we de nieuwe set automatisch mee (router.refresh
      // veroorzaakt re-mount → deze effect draait opnieuw).
      fetchSuggestions("pending"),
    ])
      .then(([rev, occCurrent, occNext, r, suggestions]) => {
        setReviews(rev);
        const merged = new Map<string, OccupancyDay>();
        for (const d of [...occCurrent, ...occNext]) merged.set(d.date, d);
        setOccupancy(Array.from(merged.values()));
        setRestaurant(r);
        // Filter target_dates uit pending low_occupancy-suggesties.
        const dates = new Set<string>();
        for (const s of suggestions) {
          if (s.trigger_type !== "low_occupancy") continue;
          const ctx = s.trigger_context as { target_date?: string } | null;
          if (ctx?.target_date) dates.add(ctx.target_date);
        }
        setPendingDates(dates);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Klik buiten low-occ popover → sluiten. Skipt tijdens loading om
  // false-fires te voorkomen.
  useEffect(() => {
    if (!lowOccOpen) return;
    const onClick = (e: MouseEvent) => {
      if (lowOccRef.current && !lowOccRef.current.contains(e.target as Node)) {
        setLowOccOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [lowOccOpen]);

  const reviewTasks: ReviewTask[] = useMemo(() => {
    if (!restaurant) return [];
    const threshold = restaurant.low_review_threshold ?? 3;
    return reviews
      .filter((r) => r.rating <= threshold && !r.response_text)
      .map((r) => ({
        id: `review-${r.id}`,
        icon: "⭐",
        title: `${r.rating}-ster review op ${r.source}`,
        desc: r.title ?? r.body?.slice(0, 100) ?? "Review vereist reactie.",
        link: `/dashboard/google-business/reviews?openReply=${r.id}`,
      }));
  }, [reviews, restaurant]);

  const lowOccBlock = useMemo(() => {
    if (!restaurant) return null;
    const threshold = restaurant.low_occupancy_threshold ?? 50;
    const today = new Date();
    const windowDays = buildWindowOccupancy(
      occupancy,
      today,
      LOW_OCCUPANCY_WINDOW_DAYS,
    );
    const lowDays = windowDays.filter((d) => {
      if (d.occupancy_pct >= threshold) return false;
      if (!isOpenOn(restaurant, d.date)) return false;
      // Skip dagen waarvoor al een pending Filly-voorstel klaarstaat,
      // anders krijgt eigenaar dubbele voorstellen voor dezelfde dag.
      if (pendingDates.has(d.date)) return false;
      return true;
    });
    if (lowDays.length === 0) return null;
    return { lowDays, threshold };
  }, [occupancy, restaurant, pendingDates]);

  // Niet tonen tijdens loading of als er niks te doen is.
  const hasAnything = reviewTasks.length > 0 || lowOccBlock !== null;
  if (loading || !hasAnything) return null;

  // Gedeelde card-styling (border, padding, layout) voor beide
  // soorten kaarten zodat ze visueel matchen in dezelfde grid.
  const cardInnerStyle = {
    display: "flex",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid var(--border, #E5DFD0)",
    borderRadius: 8,
    background: "var(--white, #FFFFFF)",
    alignItems: "flex-start",
  } as const;

  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text, #18181B)",
            marginBottom: 2,
          }}
        >
          Overige acties
        </div>
        <div style={{ fontSize: 12, color: "var(--tl)" }}>
          Reviews zonder reactie en rustige dagen komende 2 weken.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          gap: 12,
        }}
      >
        {/* ----- Review-kaarten ----- */}
        {reviewTasks.map((t) => (
          <Link
            key={t.id}
            href={t.link}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={cardInnerStyle}>
              <div style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text, #18181B)",
                    marginBottom: 2,
                  }}
                >
                  {t.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {t.desc}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: URGENCY_RED,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: URGENCY_RED,
                  }}
                />
                Nu
              </div>
            </div>
          </Link>
        ))}

        {/* ----- Lage-bezetting-kaart met popover -----
            Zelfde grootte/styling als de review-kaarten. Klik =
            popover onder de kaart met SuggestionsPanel. Position
            relative op de wrapper zodat de popover correct positioneert.
            Click-buiten sluit 'm. */}
        {lowOccBlock && (
          <div
            ref={lowOccRef}
            style={{ position: "relative", minWidth: 0 }}
          >
            <button
              type="button"
              onClick={() => setLowOccOpen((v) => !v)}
              style={{
                ...cardInnerStyle,
                width: "100%",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                color: "inherit",
              }}
              aria-expanded={lowOccOpen}
            >
              <div style={{ fontSize: 20, lineHeight: 1 }}>📉</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text, #18181B)",
                    marginBottom: 2,
                  }}
                >
                  {lowOccBlock.lowDays.length} rustige dag
                  {lowOccBlock.lowDays.length > 1 ? "en" : ""} komende 2
                  weken
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tl)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {lowOccBlock.lowDays
                    .slice(0, 3)
                    .map((d) => {
                      const date = new Date(`${d.date}T00:00:00`);
                      return `${date.getDate()} ${date.toLocaleString("nl-NL", { month: "short" })} (${d.occupancy_pct}%)`;
                    })
                    .join(", ")}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: URGENCY_RED,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: URGENCY_RED,
                  }}
                />
                Nu
              </div>
            </button>

            {lowOccOpen && (
              <div
                style={{
                  position: "absolute",
                  // Popover hangt onder de kaart, links uitgelijnd.
                  // Z-index hoger dan eventuele andere kaarten in
                  // de grid zodat 'ie overheen valt.
                  top: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 50,
                  width: 360,
                  maxWidth: "calc(100vw - 32px)",
                  maxHeight: 480,
                  overflowY: "auto",
                  background: "var(--white, #FFFFFF)",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: 16,
                }}
              >
                <SuggestionsPanel
                  lowOccupancyDays={lowOccBlock.lowDays}
                  specialDays={[]}
                  occupancyThreshold={lowOccBlock.threshold}
                  onSuccess={() => {
                    setLowOccOpen(false);
                    // /campagnes herladen zodat de bovenste Filly-
                    // voorstellen-strip de nieuwe ai_suggestions direct
                    // toont.
                    router.refresh();
                  }}
                  onCancel={() => setLowOccOpen(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
