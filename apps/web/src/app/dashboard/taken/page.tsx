"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchSuggestions,
  fetchGuests,
  fetchReservations,
  fetchReviews,
  fetchOccupancy,
  type AiSuggestion,
  type Guest,
  type Reservation,
  type Review,
  type OccupancyDay,
} from "../../../lib/api";
import { Skeleton } from "../_components/skeleton";

type TaskItem = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  link?: string;
  priority: "high" | "medium" | "low";
};

const priorityColor = {
  high: "#DC2626",
  medium: "#F97316",
  low: "#A1A1AA",
};

export default function TakenPage() {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      fetchSuggestions("pending"),
      fetchGuests(),
      fetchReservations(
        now.toISOString().slice(0, 10),
        new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      ),
      fetchReviews(),
      fetchOccupancy(now.getFullYear(), now.getMonth()),
    ])
      .then(([s, g, r, rev, o]) => {
        setSuggestions(s);
        setGuests(g);
        setReservations(r);
        setReviews(rev);
        setOccupancy(o);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tasks = useMemo((): TaskItem[] => {
    const out: TaskItem[] = [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(today.getDate() + 7);

    // Wachtende AI-suggesties
    for (const s of suggestions) {
      const name =
        (s.suggested_campaign.name as string | undefined) ??
        "Campagne-voorstel";
      out.push({
        id: `sug-${s.id}`,
        icon: "💡",
        title: `Filly stelt voor: ${name}`,
        desc: s.reasoning ?? "Open de Suggesties-pagina voor onderbouwing.",
        link: "/dashboard/suggesties",
        priority: (s.urgency ?? "medium") as TaskItem["priority"],
      });
    }

    // Lage bezetting komende week
    const lowDays = occupancy.filter((d) => {
      if (d.date <= todayStr) return false;
      if (d.date > weekFromNow.toISOString().slice(0, 10)) return false;
      return d.occupancy_pct < 50;
    });
    if (lowDays.length > 0) {
      out.push({
        id: "low-occ",
        icon: "📉",
        title: `${lowDays.length} rustige dag${lowDays.length > 1 ? "en" : ""} komende week`,
        desc: lowDays
          .slice(0, 3)
          .map((d) => {
            const date = new Date(d.date);
            return `${date.getDate()} ${date.toLocaleString("nl-NL", { month: "short" })} (${d.occupancy_pct}%)`;
          })
          .join(", "),
        link: "/dashboard",
        priority: "high",
      });
    }

    // Verjaardagen komende 7 dagen
    const upcomingBirthdays = guests.filter((g) => {
      if (!g.birthday) return false;
      const bday = new Date(g.birthday);
      const thisYear = new Date(
        today.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      if (thisYear < today) {
        thisYear.setFullYear(today.getFullYear() + 1);
      }
      const diff =
        (thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    });
    for (const g of upcomingBirthdays) {
      out.push({
        id: `bday-${g.id}`,
        icon: "🎂",
        title: `${g.first_name} ${g.last_name} is bijna jarig`,
        desc: `Tip: stuur Filly een verjaardag-uitnodiging of persoonlijke groet.`,
        link: "/dashboard/gasten",
        priority: "medium",
      });
    }

    // Reviews die reactie nodig hebben
    const needsReply = reviews.filter(
      (r) => r.rating <= 3 && !r.response_text,
    );
    for (const r of needsReply) {
      out.push({
        id: `review-${r.id}`,
        icon: "⭐",
        title: `${r.rating}-ster review op ${r.source}`,
        desc: r.title ?? r.body?.slice(0, 100) ?? "Review vereist reactie.",
        link: "/dashboard/reviews",
        priority: "high",
      });
    }

    // Vandaag's grote reserveringen (6+ personen)
    const bigReservationsToday = reservations.filter(
      (r) =>
        r.reservation_date === todayStr &&
        r.party_size >= 6 &&
        r.status === "bevestigd",
    );
    for (const r of bigReservationsToday) {
      out.push({
        id: `big-res-${r.id}`,
        icon: "👥",
        title: `Groepsreservering vandaag — ${r.party_size} personen`,
        desc: `${r.guest_name} · ${r.reservation_time.slice(0, 5)} · tafel ${r.table_code ?? "—"}${r.special_requests ? ` · "${r.special_requests}"` : ""}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
      });
    }

    // Special requests vandaag
    const specialsToday = reservations.filter(
      (r) =>
        r.reservation_date === todayStr &&
        r.special_requests &&
        r.party_size < 6 &&
        r.status === "bevestigd",
    );
    for (const r of specialsToday) {
      out.push({
        id: `sp-${r.id}`,
        icon: "💬",
        title: `Speciaal verzoek — ${r.guest_name}`,
        desc: `${r.reservation_time.slice(0, 5)} · ${r.special_requests}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
      });
    }

    // Sort by priority
    const order = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [suggestions, guests, reservations, reviews, occupancy]);

  const highCount = tasks.filter((t) => t.priority === "high").length;

  return (
    <div className="page-full">
      <div className="page-title">Taken</div>
      <div className="page-subtitle">
        Alles wat vandaag je aandacht vraagt — AI-voorstellen, reviews,
        reserveringen en alerts.
      </div>

      {loading ? (
        <div>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={74} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✨</div>
          <div className="empty-title">Alles onder controle</div>
          <div className="empty-desc">
            Geen openstaande taken. Filly komt zodra er iets opduikt.
          </div>
        </div>
      ) : (
        <>
          {highCount > 0 && (
            <div className="alert-bar">
              <span className="alert-icon">⚠️</span>
              <div>
                <strong>{highCount} taken</strong> hebben hoge urgentie — pak ze
                eerst op.
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((t) => {
              const inner = (
                <div
                  style={{
                    background: "var(--white)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "border-color 0.15s",
                    cursor: t.link ? "pointer" : "default",
                  }}
                >
                  <div style={{ fontSize: 22 }}>{t.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ts)",
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {t.desc}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: priorityColor[t.priority],
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: priorityColor[t.priority],
                      }}
                    />
                    {t.priority === "high"
                      ? "Nu"
                      : t.priority === "medium"
                        ? "Deze week"
                        : "Planning"}
                  </div>
                </div>
              );
              return t.link ? (
                <Link
                  key={t.id}
                  href={t.link}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {inner}
                </Link>
              ) : (
                <div key={t.id}>{inner}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
