"use client";

import {
  mergeMonthData,
  maandenNL,
  seededOccupancy,
  mondayIndex,
} from "../_lib/calendar-data";
import type { OccupancyDay } from "../../../lib/api";

type View = "dag" | "week" | "maand" | "jaar";

type Props = {
  view: View;
  setView: (v: View) => void;
  viewYear: number;
  setViewYear: (n: number) => void;
  viewMonth: number;
  setViewMonth: (n: number) => void;
  selectedDay: number | null;
  setSelectedDay: (n: number | null) => void;
  occupancy: OccupancyDay[];
};

const weekdays = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

/**
 * Map occupancy-percentage naar één van vijf heatmap-tiers.
 *   <40%  = lvl-0 (rood)        — kritiek
 *   40-65 = lvl-1 (koper licht) — onder verwachting
 *   65-80 = lvl-2 (koper)       — gemiddeld
 *   80-95 = lvl-3 (groen licht) — goed
 *   95+   = lvl-4 (groen vol)   — topdag
 *
 * Zelfde tiers als de mini-dashboard op de landingspagina, zodat de
 * kalender op het echte dashboard er identiek uitziet.
 */
function occupancyTier(pct: number): number {
  if (pct < 40) return 0;
  if (pct < 65) return 1;
  if (pct < 80) return 2;
  if (pct < 95) return 3;
  return 4;
}

/**
 * Emoji per campagne-type voor de kalender-cel. Vervangt de oude
 * cal-dots zodat de eigenaar in één oogopslag ziet wélk soort campagne
 * er op een dag staat (mail / social / whatsapp), niet alleen dat er
 * iets staat.
 */
/**
 * Format een week-range als "5 - 11 mei" of "27 apr - 3 mei" (over
 * maand-grens). Gebruikt door de prev/next-label in week-view.
 */
function formatWeekRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", { month: "short" });
  const sMonth = fmt.format(start);
  const eMonth = fmt.format(end);
  if (sMonth === eMonth) {
    return `${start.getDate()} - ${end.getDate()} ${eMonth}`;
  }
  return `${start.getDate()} ${sMonth} - ${end.getDate()} ${eMonth}`;
}

function campaignEmoji(type: string): string {
  if (type === "mail") return "✉️";
  if (type === "social") return "📱";
  if (type === "whatsapp") return "💬";
  return "•";
}

/**
 * Mock uurbezetting voor de dag-view. We hebben (nog) geen echte
 * hourly-data — die komt via reserveringsplatform-integraties (Zenchef
 * etc.). Tot die tijd genereren we een realistische horeca-dag-shape:
 * lunch-piek 12-14u, dip 15-17u, diner-piek 18-21u. We schalen het
 * geheel met de dag-bezetting van de geselecteerde dag zodat een
 * rustige dinsdag (38%) overal lager uitkomt dan een drukke vrijdag
 * (95%). Variatie per uur via dayIdx-jitter zodat dezelfde dag-pct
 * niet op elke datum identiek is.
 *
 * Vervang deze functie zodra de api een /occupancy/hours endpoint
 * heeft (per-restaurant-per-dag uur-aggregaten van reservations).
 */
const HOUR_LABELS = ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];
const HOUR_BASELINE = [25, 70, 85, 60, 25, 15, 35, 70, 95, 90, 65, 35];

function mockHourlyForDay(dayPct: number, dayIdx: number): number[] {
  // Schalen rond gemiddelde — als dayPct hoog is wordt elk uur hoger,
  // als dayPct laag is, lager. Houd hoofd-shape (lunch/diner) intact.
  const target = dayPct || 50;
  const baselineAvg = HOUR_BASELINE.reduce((a, b) => a + b, 0) / HOUR_BASELINE.length;
  const factor = target / baselineAvg;
  return HOUR_BASELINE.map((b, i) => {
    const jitter = ((dayIdx * 3 + i * 7) % 9) - 4;
    return Math.max(0, Math.min(100, Math.round(b * factor) + jitter));
  });
}

export function CalendarCard({
  view,
  setView,
  viewYear,
  setViewYear,
  viewMonth,
  setViewMonth,
  selectedDay,
  setSelectedDay,
  occupancy,
}: Props) {
  const today = new Date();
  const cells = mergeMonthData(viewYear, viewMonth, occupancy);

  const monthName =
    maandenNL[viewMonth].charAt(0).toUpperCase() +
    maandenNL[viewMonth].slice(1);

  // Bepaal de Maandag van de week waar selectedDay (of vandaag) in valt.
  // Gebruikt door week-view om de 7 dagen Ma-Zo te tonen, en door
  // prev/next om per week te schuiven.
  const weekAnchor = new Date(
    viewYear,
    viewMonth,
    selectedDay ?? todayNumLocal(),
  );
  const weekDayOffset = (weekAnchor.getDay() + 6) % 7; // 0=Ma, 6=Zo
  const weekStart = new Date(weekAnchor);
  weekStart.setDate(weekAnchor.getDate() - weekDayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Label-tekst boven prev/next: jaar voor jaar-view, "5 - 11 mei" voor
  // week-view, "Mei 2026" voor dag/maand-view.
  const label =
    view === "jaar"
      ? `${viewYear}`
      : view === "week"
        ? formatWeekRange(weekStart, weekEnd)
        : `${monthName} ${viewYear}`;

  const goPrev = () => {
    if (view === "jaar") {
      setViewYear(viewYear - 1);
      setSelectedDay(null);
      return;
    }
    if (view === "week") {
      // 7 dagen terug, met overflow-handling naar vorige maand/jaar.
      shiftSelectedDay(-7);
      return;
    }
    setSelectedDay(null);
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
    if (view === "jaar") {
      setViewYear(viewYear + 1);
      setSelectedDay(null);
      return;
    }
    if (view === "week") {
      shiftSelectedDay(7);
      return;
    }
    setSelectedDay(null);
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Helper voor week-navigatie: schuif selectedDay (of vandaag-day) met
  // ±7 dagen, en update viewMonth/viewYear als we over een maandgrens
  // gaan. Zo blijft de occupancy-prop (per maand opgehaald) consistent
  // met wat de week-view toont.
  function shiftSelectedDay(deltaDays: number): void {
    const base = new Date(
      viewYear,
      viewMonth,
      selectedDay ?? todayNumLocal(),
    );
    base.setDate(base.getDate() + deltaDays);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setSelectedDay(base.getDate());
  }

  function todayNumLocal(): number {
    return today.getDate();
  }
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today.getDate());
    setView("maand");
  };

  const isTodayMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const todayNum = today.getDate();

  // Wanneer user op Dag-tab klikt zonder een dag gekozen: pak vandaag
  // als die in de huidige maand valt, anders eerste dag van maand.
  const onViewChange = (v: View) => {
    if (v === "dag" && selectedDay === null) {
      if (isTodayMonth) {
        setSelectedDay(todayNum);
      } else {
        setSelectedDay(1);
      }
    }
    setView(v);
  };

  const onDayClick = (day: number) => {
    setSelectedDay(day);
    setView("dag");
  };

  const yearMonthlyAvg = [56, 54, 60, 66, 72, 78, 82, 80, 74, 66, 58, 64];
  const onYearMonthClick = (m: number) => {
    setViewMonth(m);
    setSelectedDay(null);
    setView("maand");
  };

  return (
    <div className="card calendar-card">
      <div className="card-h">
        <div className="cal-controls" style={{ width: "100%" }}>
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={goPrev} aria-label="Vorige">
              ‹
            </button>
            <div className="cal-nav-label">{label}</div>
            <button className="cal-nav-btn" onClick={goNext} aria-label="Volgende">
              ›
            </button>
            <button className="cal-today-btn" onClick={goToday}>
              Vandaag
            </button>
          </div>
          <div className="toggle-group">
            {(["dag", "week", "maand", "jaar"] as View[]).map((v) => (
              <button
                key={v}
                className={`toggle-btn ${view === v ? "active" : ""}`}
                onClick={() => onViewChange(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card-b">
        {view === "maand" && (
          <>
            <div className="cal-header">
              {weekdays.map((d) => (
                <div key={d} className="cal-hc">
                  {d}
                </div>
              ))}
            </div>
            <div className="cal-grid">
              {cells.map((cell, i) => {
                if (!cell)
                  return <div key={`e-${i}`} className="cal-cell empty" />;
                const isToday = isTodayMonth && cell.day === todayNum;
                const isSelected = selectedDay === cell.day;
                const tier = occupancyTier(cell.occupancy);
                return (
                  <div
                    key={cell.day}
                    className={`cal-cell lvl-${tier} ${isToday ? "today" : ""} ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => onDayClick(cell.day)}
                  >
                    <div className="cal-dn">{cell.day}</div>
                    <div className="cal-occ">{cell.occupancy}%</div>
                    {cell.occupancy >= 95 && (
                      <div className="cal-hot" title="Topdag">
                        🔥
                      </div>
                    )}
                    {cell.campaigns.length > 0 && (
                      <div className="cal-emojis">
                        {cell.campaigns.map((c, idx) => (
                          <span key={idx} className="cal-emoji" title={c}>
                            {campaignEmoji(c)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === "dag" && (() => {
          // Vind de bezetting van de geselecteerde dag (default 50% als
          // de dag niet in de occupancy-array zit). De staafdiagram
          // schaalt rond dat percentage; mock-data tot er hourly-data
          // uit reserveringsplatform-koppelingen komt.
          const selected = selectedDay ?? todayNum;
          const dayCell = cells.find((c) => c && c.day === selected);
          const dayPct = dayCell?.occupancy ?? 50;
          const hours = mockHourlyForDay(dayPct, selected);
          const dayName = new Date(viewYear, viewMonth, selected).toLocaleString(
            "nl-NL",
            { weekday: "long" },
          );
          return (
            <div className="day-view">
              <div className="day-view-head">
                <div className="day-view-title">
                  {dayName.charAt(0).toUpperCase() + dayName.slice(1)}{" "}
                  {selected} {monthName.toLowerCase()}
                </div>
                <div className="day-view-sub">
                  Bezetting per uur · totaal {dayPct}%
                </div>
              </div>
              <div className="day-hours">
                {hours.map((pct, i) => {
                  const tier = occupancyTier(pct);
                  return (
                    <div key={HOUR_LABELS[i]} className="day-hour">
                      <div className="day-hour-pct">{pct}%</div>
                      <div className="day-hour-track">
                        <div
                          className={`day-hour-bar lvl-${tier}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <div className="day-hour-label">{HOUR_LABELS[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {view === "week" && (() => {
          // Bouw 7 dag-objecten Ma t/m Zo, beginnend bij weekStart.
          // Bezettings-% komt uit dezelfde bron als de maand-view: real
          // data uit de occupancy-prop wanneer beschikbaar, anders de
          // deterministische seededOccupancy-fallback. Zonder die
          // fallback toonde week-view 0% voor dagen buiten de geladen
          // maand terwijl maand-view zelf wel een mock-percentage liet
          // zien — percentages moeten matchen tussen views.
          const dayLabels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
          const todayStr = today.toISOString().slice(0, 10);
          const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            const cell = occupancy.find((o) => o.date === dateStr);
            const fallbackPct = seededOccupancy(
              d.getDate(),
              mondayIndex(d.getDay()),
            );
            return {
              date: d,
              dateStr,
              pct: cell?.occupancy_pct ?? fallbackPct,
              isToday: dateStr === todayStr,
            };
          });
          return (
            <div className="day-view">
              <div className="day-view-head">
                <div className="day-view-title">
                  {formatWeekRange(weekStart, weekEnd)}
                </div>
                <div className="day-view-sub">Bezetting per dag</div>
              </div>
              <div className="day-hours" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                {days.map((d, i) => {
                  const tier = occupancyTier(d.pct);
                  return (
                    <div
                      key={d.dateStr}
                      className="day-hour"
                      onClick={() => {
                        // Klik = ga naar dag-view voor die specifieke dag.
                        // Update viewMonth/Year als de dag in een andere
                        // maand valt dan momenteel geladen.
                        setViewYear(d.date.getFullYear());
                        setViewMonth(d.date.getMonth());
                        setSelectedDay(d.date.getDate());
                        setView("dag");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="day-hour-pct">{d.pct}%</div>
                      <div className="day-hour-track">
                        <div
                          className={`day-hour-bar lvl-${tier}`}
                          style={{ height: `${Math.max(d.pct, 4)}%` }}
                        />
                      </div>
                      <div
                        className="day-hour-label"
                        style={{
                          fontWeight: d.isToday ? 700 : 500,
                          color: d.isToday
                            ? "var(--accent)"
                            : "var(--tl)",
                        }}
                      >
                        {dayLabels[i]} {d.date.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {view === "jaar" && (
          <div className="year-grid">
            {maandenNL.map((m, idx) => {
              const pct = yearMonthlyAvg[idx];
              const isCurrent =
                viewYear === today.getFullYear() && idx === today.getMonth();
              return (
                <div
                  key={m}
                  className={`yr-cell ${isCurrent ? "current" : ""}`}
                  onClick={() => onYearMonthClick(idx)}
                >
                  <div className="yr-name">
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </div>
                  <div className="yr-pct">{pct}%</div>
                  <div className="yr-bar">
                    <div className="yr-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
