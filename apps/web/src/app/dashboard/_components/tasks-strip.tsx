"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchOccupancy,
  fetchRestaurant,
  fetchReviews,
  type OccupancyDay,
  type Restaurant,
  type Review,
} from "../../../lib/api";

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
// Sluitingsdagen worden expliciet gefilterd:
//   - Datums in restaurant.closed_dates (vakantie, etc)
//   - Vaste sluitingsdagen via opening_hours[weekday] = null
//
// Zodra een dag boven de bezetting-drempel komt (bv. nieuwe reserveringen)
// verdwijnt 'ie automatisch uit het lijstje — er is geen "afgehandeld"-
// state, de strip leest gewoon de actuele bezetting.

type TaskItem = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  link: string;
  priority: "high" | "medium" | "low";
};

const priorityColor = {
  high: "#DC2626",
  medium: "#F97316",
  low: "#A1A1AA",
};

const priorityLabel: Record<TaskItem["priority"], string> = {
  high: "Nu",
  medium: "Deze week",
  low: "Planning",
};

// Mapping van JS-weekday (0=zondag, 1=maandag, ...) naar de keys die
// we in opening_hours gebruiken. Datums in opening_hours zijn engels
// (mon/tue/wed/thu/fri/sat/sun), JS Date.getDay() begint bij zondag=0.
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function TasksStrip() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We hebben mogelijk 2 maanden bezetting-data nodig: als vandaag
    // bv. 25 mei is, valt 8 juni binnen het 14-daagse venster.
    // Daarom altijd huidige + volgende maand parallel ophalen, kost
    // 2 lichte HTTP-calls extra maar voorkomt randgeval-bugs.
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    Promise.all([
      fetchReviews(),
      fetchOccupancy(now.getFullYear(), now.getMonth()),
      fetchOccupancy(nextMonth.getFullYear(), nextMonth.getMonth()),
      fetchRestaurant(),
    ])
      .then(([rev, occCurrent, occNext, r]) => {
        setReviews(rev);
        // Concat + dedupe op datum-key voor zekerheid. Backend
        // retourneert per maand, geen overlap verwacht maar
        // defensief is goedkoop.
        const merged = new Map<string, OccupancyDay>();
        for (const d of [...occCurrent, ...occNext]) merged.set(d.date, d);
        setOccupancy(Array.from(merged.values()));
        setRestaurant(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tasks = useMemo((): TaskItem[] => {
    if (!restaurant) return [];
    const out: TaskItem[] = [];

    // ----- 1. Lage reviews zonder reactie -----
    const reviewThreshold = restaurant.low_review_threshold ?? 3;
    for (const r of reviews) {
      if (r.rating > reviewThreshold) continue;
      if (r.response_text) continue;
      out.push({
        id: `review-${r.id}`,
        icon: "⭐",
        title: `${r.rating}-ster review op ${r.source}`,
        desc: r.title ?? r.body?.slice(0, 100) ?? "Review vereist reactie.",
        link: `/dashboard/google-business/reviews?openReply=${r.id}`,
        priority: "high",
      });
    }

    // ----- 2. Lage bezetting komende 14 dagen -----
    const occupancyThreshold = restaurant.low_occupancy_threshold ?? 50;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const cutoff = new Date(today);
    cutoff.setDate(today.getDate() + 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const closedDatesSet = new Set(restaurant.closed_dates ?? []);
    const openingHours = restaurant.opening_hours ?? {};

    const lowDays = occupancy.filter((d) => {
      // Voorbij of vandaag → niet meer relevant als "actie".
      if (d.date <= todayStr) return false;
      // Buiten 14-daagse venster.
      if (d.date > cutoffStr) return false;
      // Bezetting boven drempel → "halen we, geen zorg".
      if (d.occupancy_pct >= occupancyThreshold) return false;
      // Sluitingsdag (vakantie, ad hoc gesloten).
      if (closedDatesSet.has(d.date)) return false;
      // Vaste wekelijkse sluiting (opening_hours[mon..sun] = null).
      const weekday = WEEKDAY_KEYS[new Date(d.date + "T00:00:00").getDay()];
      const hours = openingHours[weekday];
      if (hours === null || hours === undefined) return false;
      return true;
    });

    if (lowDays.length > 0) {
      // Eén verzamelkaart met de eerste 3 dagen als preview-tekst,
      // i.p.v. N losse kaarten. Compacter en geeft een gevoel van
      // omvang ("3 rustige dagen komende week" zegt meer dan 3 losse).
      out.push({
        id: "low-occ",
        icon: "📉",
        title: `${lowDays.length} rustige dag${lowDays.length > 1 ? "en" : ""} komende 2 weken`,
        desc: lowDays
          .slice(0, 3)
          .map((d) => {
            const date = new Date(d.date + "T00:00:00");
            return `${date.getDate()} ${date.toLocaleString("nl-NL", { month: "short" })} (${d.occupancy_pct}%)`;
          })
          .join(", "),
        link: "/dashboard",
        priority: "high",
      });
    }

    return out;
  }, [reviews, occupancy, restaurant]);

  // Niet tonen tijdens loading of als er niks te doen is.
  if (loading || tasks.length === 0) return null;

  return (
    <section style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 2,
        }}
      >
        <div>
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
      </div>

      <div style={{ height: 8 }} />

      {/* Scroll-container: max 320px hoog (≈ 4-5 taken zichtbaar)
          zodat de pagina niet eindeloos lang wordt. */}
      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 8,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 12,
          }}
        >
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={t.link}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 14px",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 8,
                  background: "var(--white, #FFFFFF)",
                  alignItems: "flex-start",
                }}
              >
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
                    color: priorityColor[t.priority],
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: priorityColor[t.priority],
                    }}
                  />
                  {priorityLabel[t.priority]}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
