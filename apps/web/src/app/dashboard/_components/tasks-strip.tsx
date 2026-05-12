"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchRestaurant,
  fetchReviews,
  type Restaurant,
  type Review,
} from "../../../lib/api";

// ============================================================
// TasksStrip, "overige acties" voor Filly's verzamelpagina
// ============================================================
// Compact strookje onder de Filly-voorstellen op /dashboard/campagnes.
// Toont items die handmatige aandacht van de eigenaar vragen.
//
// Per 2026-05-12: gestripped naar **alleen lage reviews zonder reactie**.
// Eerder bevatte deze strip ook groepsreserveringen, speciale verzoeken,
// verjaardagen en lage-bezetting-insights. Floris wil eerst de
// reviews-flow strak hebben, andere acties komen later terug.
//
// Drempel "wanneer is iets een lage review" is per-restaurant
// configureerbaar op de account-pagina (sinds mig 0036, default 3
// sterren). De strip leest 'm uit Restaurant.low_review_threshold.

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

export function TasksStrip() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Reviews + restaurant-config parallel ophalen. Restaurant is
    // nodig voor de per-restaurant drempel (low_review_threshold).
    Promise.all([fetchReviews(), fetchRestaurant()])
      .then(([rev, r]) => {
        setReviews(rev);
        setRestaurant(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Takenberekening. Alleen reviews voor nu (zie header-comment).
  // Deep-link bevat ?openReply=<id> zodat de reviews-pagina direct
  // de reply-modal opent voor déze review.
  const tasks = useMemo((): TaskItem[] => {
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
        priority: "high",
      }));
  }, [reviews, restaurant]);

  // Niet tonen tijdens loading of als er niks te doen is. Een lege
  // strip met "geen taken" zou alleen visuele ruis zijn naast de
  // Filly-voorstellen die er sowieso al staan.
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
            Reviews met een lage beoordeling die nog geen reactie hebben.
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
