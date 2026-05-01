"use client";

import { mergeMonthData, maandenNL } from "../_lib/calendar-data";
import type { OccupancyDay } from "../../../lib/api";

type View = "dag" | "maand" | "jaar";

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
  const label =
    view === "jaar" ? `${viewYear}` : `${monthName} ${viewYear}`;

  const goPrev = () => {
    setSelectedDay(null);
    if (view === "jaar") {
      setViewYear(viewYear - 1);
      return;
    }
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
    setSelectedDay(null);
    if (view === "jaar") {
      setViewYear(viewYear + 1);
      return;
    }
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
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
            {(["dag", "maand", "jaar"] as View[]).map((v) => (
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
