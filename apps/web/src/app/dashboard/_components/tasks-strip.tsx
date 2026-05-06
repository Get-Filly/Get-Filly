"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchGuests,
  fetchReservations,
  fetchReviews,
  fetchOccupancy,
  type Guest,
  type Reservation,
  type Review,
  type OccupancyDay,
} from "../../../lib/api";

// ============================================================
// TasksStrip, "overige acties" voor Filly's verzamelpagina
// ============================================================
// Dynamische takenlijst op basis van de actuele data in het platform.
// Bevat geen Filly-suggesties (die hebben hun eigen strip bovenaan),
// maar wel álles daaromheen:
//   - Reviews met lage beoordeling zonder reactie
//   - Reserveringen met speciale verzoeken of grote groepen
//   - Aanstaande verjaardagen (mogelijkheid voor persoonlijke touch)
//   - Inzichten (lage bezetting-dips komende week)
//
// Eerder stond deze logica op /dashboard/taken. Nu we die pagina
// samenvoegen met /dashboard/campagnes is dit de centrale
// todo-laag onder de AI-voorstellen.

type TaskCategory = "reviews" | "reserveringen" | "insights";

type TaskItem = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  link?: string;
  priority: "high" | "medium" | "low";
  category: TaskCategory;
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

// Filter-tabs in de TasksStrip. 'action' = priority high + medium
// (de "doet er deze week toe"-categorie). 'all' toont ook low.
type TaskFilter = "all" | "action";

export function TasksStrip() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [loading, setLoading] = useState(true);
  // Default 'action' zodat user direct ziet wat NU telt; veelal is
  // dat ook de korte lijst die op één scherm past zonder scrollen.
  const [filter, setFilter] = useState<TaskFilter>("action");

  useEffect(() => {
    const now = new Date();
    Promise.all([
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
      .then(([g, r, rev, o]) => {
        setGuests(g);
        setReservations(r);
        setReviews(rev);
        setOccupancy(o);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Takenberekening. Ordening van sterkste signaal (hoge urgentie)
  // naar zwakste. Alle logica is deterministisch, geen extra
  // AI-calls nodig, data komt rechtstreeks uit de platform-tabellen.
  const tasks = useMemo((): TaskItem[] => {
    const out: TaskItem[] = [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(today.getDate() + 7);

    // Reviews die reactie nodig hebben (≤3 sterren zonder response).
    const needsReply = reviews.filter(
      (r) => r.rating <= 3 && !r.response_text,
    );
    for (const r of needsReply) {
      out.push({
        id: `review-${r.id}`,
        icon: "⭐",
        title: `${r.rating}-ster review op ${r.source}`,
        desc: r.title ?? r.body?.slice(0, 100) ?? "Review vereist reactie.",
        link: "/dashboard/google-business/reviews",
        priority: "high",
        category: "reviews",
      });
    }

    // Lage bezetting komende week, insight met actie-potentie.
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
        category: "insights",
      });
    }

    // Vandaag's grote reserveringen (6+ personen), medium urgent.
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
        title: `Groepsreservering vandaag, ${r.party_size} personen`,
        desc: `${r.guest_name} · ${r.reservation_time.slice(0, 5)} · tafel ${r.table_code ?? "—"}${r.special_requests ? ` · "${r.special_requests}"` : ""}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
        category: "reserveringen",
      });
    }

    // Speciale verzoeken vandaag (< 6 pers, anders dubbel met boven).
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
        title: `Speciaal verzoek, ${r.guest_name}`,
        desc: `${r.reservation_time.slice(0, 5)} · ${r.special_requests}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
        category: "reserveringen",
      });
    }

    // Verjaardagen komende 7 dagen, planning-taak.
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
        desc: "Tip: stuur Filly een verjaardag-uitnodiging of persoonlijke groet.",
        link: "/dashboard/gasten",
        priority: "low",
        category: "insights",
      });
    }

    const order = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [guests, reservations, reviews, occupancy]);

  // Counts vóór filtering, zodat de tabs altijd de juiste aantallen
  // tonen, ook in 'action'-modus waar je low-prio niet ziet.
  const actionCount = tasks.filter(
    (t) => t.priority === "high" || t.priority === "medium",
  ).length;
  const totalCount = tasks.length;

  // Toepassen van de actieve filter.
  const visibleTasks =
    filter === "action"
      ? tasks.filter(
          (t) => t.priority === "high" || t.priority === "medium",
        )
      : tasks;

  // Niet tonen tijdens loading of als er helemaal niks te doen is,
  // een lege strip met "geen taken" zou alleen visuele ruis zijn op
  // een pagina die de Filly-voorstellen en campagnes al toont.
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
            Reviews, reserveringen en inzichten die je aandacht vragen.
          </div>
        </div>

        {/* Filter-tabs rechts in de header. "Actie vereist" telt high
            + medium (oranje + rood); de pagina is daarmee direct
            actie-gericht. Toggle naar "Alle" voor planning/low-prio. */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => setFilter("action")}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: filter === "action" ? 600 : 500,
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 999,
              background:
                filter === "action"
                  ? "var(--accent-light, #D6E0D8)"
                  : "transparent",
              color:
                filter === "action"
                  ? "var(--accent, #1F4A2D)"
                  : "var(--ts)",
              cursor: "pointer",
            }}
          >
            Actie vereist ({actionCount})
          </button>
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: filter === "all" ? 600 : 500,
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: 999,
              background:
                filter === "all"
                  ? "var(--accent-light, #D6E0D8)"
                  : "transparent",
              color:
                filter === "all" ? "var(--accent, #1F4A2D)" : "var(--ts)",
              cursor: "pointer",
            }}
          >
            Alle ({totalCount})
          </button>
        </div>
      </div>

      <div style={{ height: 8 }} />

      {/* Scroll-container: max 320px hoog (≈ 4-5 taken zichtbaar)
          zodat de pagina niet eindeloos lang wordt. Padding-right
          matcht met de Voorstellen-strip zodat scrollbars op gelijke
          afstand van de card-content zitten. */}
      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 8,
        }}
      >
        {visibleTasks.length === 0 ? (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--tl)",
              border: "1px dashed var(--border, #E5DFD0)",
              borderRadius: 8,
            }}
          >
            Geen taken in deze filter. Wissel naar "Alle" voor de
            volledige lijst.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              // Zelfde grid-breedte als de Voorstellen-strip op deze
              // pagina (minmax(380px, 1fr)) zodat de cards visueel
              // uitlijnen kolom-voor-kolom. Geen 480px-max meer want
              // dat liet rechts ruimte open op brede schermen.
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
              gap: 12,
            }}
          >
            {visibleTasks.map((t) => {
          const inner = (
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
        )}
      </div>
    </section>
  );
}
