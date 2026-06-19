"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
} from "@/lib/api";
import { Skeleton } from "../_components/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";

type TaskCategory = "filly" | "reviews" | "reserveringen" | "insights";

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

const priorityLabelKey: Record<TaskItem["priority"], string> = {
  high: "priorityNow",
  medium: "priorityThisWeek",
  low: "priorityPlanning",
};

type Filter = "alle" | TaskCategory;

const filterKeys: { key: Filter; labelKey: string }[] = [
  { key: "alle", labelKey: "filterAll" },
  { key: "filly", labelKey: "filterFilly" },
  { key: "reviews", labelKey: "filterReviews" },
  { key: "reserveringen", labelKey: "filterReservations" },
  { key: "insights", labelKey: "filterInsights" },
];

export default function TakenPage() {
  const t = useTranslations("dash_taken_page");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("alle");

  useEffect(() => {
    const now = new Date();
    Promise.all([
      // chat_bundle-suggesties horen alleen in de chat-flow (bundle-card)
      fetchSuggestions("pending", ["chat_bundle"]),
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

    // Wachtende AI-suggesties, altijd categorie "filly".
    for (const s of suggestions) {
      const name =
        (s.suggested_campaign.name as string | undefined) ??
        t("defaultCampaignName");
      out.push({
        id: `sug-${s.id}`,
        icon: "💡",
        title: t("suggestionTitle", { name }),
        desc: s.reasoning ?? t("suggestionDescFallback"),
        link: "/dashboard/suggesties",
        priority: (s.urgency ?? "medium") as TaskItem["priority"],
        category: "filly",
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
        title: t("lowOccTitle", { count: lowDays.length }),
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
        title: t("birthdayTitle", {
          name: `${g.first_name} ${g.last_name}`,
        }),
        desc: t("birthdayDesc"),
        link: "/dashboard/gasten",
        priority: "medium",
        category: "insights",
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
        title: t("reviewTitle", { rating: r.rating, source: r.source }),
        desc: r.title ?? r.body?.slice(0, 100) ?? t("reviewDescFallback"),
        link: "/dashboard/google-business/reviews",
        priority: "high",
        category: "reviews",
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
        title: t("bigReservationTitle", { count: r.party_size }),
        desc: `${r.guest_name} · ${r.reservation_time.slice(0, 5)} · ${t("tableLabel")} ${r.table_code ?? "—"}${r.special_requests ? ` · "${r.special_requests}"` : ""}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
        category: "reserveringen",
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
        title: t("specialRequestTitle", { name: r.guest_name ?? "" }),
        desc: `${r.reservation_time.slice(0, 5)} · ${r.special_requests}`,
        link: "/dashboard/reserveringen",
        priority: "medium",
        category: "reserveringen",
      });
    }

    // Sort by priority
    const order = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [suggestions, guests, reservations, reviews, occupancy, t]);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      high: tasks.filter((t) => t.priority === "high").length,
      filly: tasks.filter((t) => t.category === "filly").length,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    if (filter === "alle") return tasks;
    return tasks.filter((t) => t.category === filter);
  }, [tasks, filter]);

  const countPer = (key: Filter) =>
    key === "alle" ? tasks.length : tasks.filter((t) => t.category === key).length;

  const highCount = stats.high;

  return (
    <div className="page-full">
      <PageHeader
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      {/* Stats-row: totaal openstaand, hoge urgentie (rood signaal) en
          "van Filly" (brand-filly-card, aansluiting op andere pagina's). */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">{t("statTotalOpen")}</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t("statHighUrgency")}</div>
          <div
            className="stat-card-val"
            style={{
              color:
                !loading && stats.high > 0 ? "var(--red)" : "var(--text)",
            }}
          >
            {loading ? <Skeleton height={22} width="40%" /> : stats.high}
          </div>
        </div>
        <div className="stat-card stat-card-filly">
          <div className="stat-card-label">{t("statFromFilly")}</div>
          <div className="stat-card-val">
            {loading ? <Skeleton height={22} width="40%" /> : stats.filly}
          </div>
        </div>
      </div>

      {highCount > 0 && !loading && (
        <div className="alert-bar">
          <span className="alert-icon">⚠️</span>
          <div>
            {t.rich("highUrgencyAlert", {
              count: highCount,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
        </div>
      )}

      {/* Filter-tabs per categorie. Elke tab toont direct hoeveel taken
          in die categorie zitten zodat je snel weet waar actie ligt. */}
      {!loading && tasks.length > 0 && (
        <Tabs
          items={filterKeys.map((f) => ({
            key: f.key,
            label: t(f.labelKey),
            count: countPer(f.key),
          }))}
          active={filter}
          onChange={setFilter}
        />
      )}

      {loading ? (
        <div>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={74} style={{ marginBottom: 8 }} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="✨"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : filtered.length === 0 ? (
        <div className="table-empty">
          {t("emptyCategory")}
        </div>
      ) : (
        <div className="task-list">
          {filtered.map((task) => {
            const inner = (
              <div
                className={`task-card ${
                  task.category === "filly" ? "task-card-filly" : ""
                }`}
              >
                <div className="task-icon">{task.icon}</div>
                <div className="task-body">
                  <div className="task-title-row">
                    <span className="task-title">{task.title}</span>
                    {task.category === "filly" && (
                      <span className="filly-pill">Filly</span>
                    )}
                  </div>
                  <div className="task-desc">{task.desc}</div>
                </div>
                <div
                  className="task-priority"
                  style={{ color: priorityColor[task.priority] }}
                >
                  <span
                    className="task-priority-dot"
                    style={{ background: priorityColor[task.priority] }}
                  />
                  {t(priorityLabelKey[task.priority])}
                </div>
              </div>
            );
            return task.link ? (
              <Link
                key={task.id}
                href={task.link}
                className="task-link"
              >
                {inner}
              </Link>
            ) : (
              <div key={task.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
