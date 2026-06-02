"use client";

import {
  mergeMonthData,
  maandenNL,
  seededOccupancy,
  mondayIndex,
} from "../_lib/calendar-data";
import {
  TABLE_TYPES,
  TABLE_LABELS,
  activeServicesForDate,
  occupancyForServiceOnDay,
  occupancyForTableService,
  serviceTimesForDay,
  serviceTimesForRange,
  type ServiceKey,
} from "../_lib/hour-heatmap";
import { ServiceGrid, type ServiceGridRow } from "./service-grid";
import type { OccupancyDay, Restaurant } from "../../../lib/api";
// Megafoon = hetzelfde "Campagnes"-icoon als in de sidebar (lucide-react).
// Gebruikt als enige markering op een dag met een ingeplande campagne,
// i.p.v. de oude per-kanaal-emoji's (✉️/📱/💬).
import { Megaphone } from "lucide-react";

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
  // Restaurant-config: dashboard week/dag-view leest service_periods
  // om te bepalen welke kolommen (ontbijt/lunch/diner) te tonen per
  // dag. Null tijdens initial-load → fallback naar lunch + diner.
  restaurant: Restaurant | null;
};

const weekdays = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

/**
 * Map occupancy-percentage naar één van vijf heatmap-tiers.
 *   <40%  = lvl-0 (rood)       , kritiek
 *   40-65 = lvl-1 (koper licht), onder verwachting
 *   65-80 = lvl-2 (koper)      , gemiddeld
 *   80-95 = lvl-3 (groen licht), goed
 *   95+   = lvl-4 (groen vol)  , topdag
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

// Uur-data voor dag/week-view komt uit _lib/hour-heatmap (gedeeld met
// rapportages-pagina). Zodra reserveringsplatform-koppelingen
// (Zenchef etc.) echte hourly-data leveren, vervangen we de
// `hourlyForDay`-mock door een echte fetch op die plek.

export function CalendarCard({
  view,
  setView,
  viewYear,
  setViewYear,
  viewMonth,
  setViewMonth,
  selectedDay,
  setSelectedDay,
  restaurant,
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
                    <div className="cal-top">
                      <span className="cal-dn">{cell.day}</span>
                      {cell.campaigns.length > 0 && (
                        <span
                          className="cal-campaign"
                          title={
                            cell.campaigns.length === 1
                              ? "Campagne ingepland"
                              : `${cell.campaigns.length} campagnes ingepland`
                          }
                        >
                          <Megaphone size={12} strokeWidth={1.75} aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="cal-occ">{cell.occupancy}%</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === "dag" && (() => {
          // Dag-view per service-periode (Floris-redesign 2026-05-12):
          // 5 tafel-rijen × N actieve services voor deze dag. Per cel
          // de bezetting voor die (tafeltype × service)-combinatie,
          // gebaseerd op dag-overall-pct + tafel-service-multiplier.
          // Geeft eigenaar inzicht: drukke 4-pers tafels op diner?
          // Volle bar op late-shift?
          const selected = selectedDay ?? todayNum;
          const dayCell = cells.find((c) => c && c.day === selected);
          const dayPct = dayCell?.occupancy ?? 50;
          const dayObj = new Date(viewYear, viewMonth, selected);
          const dayName = dayObj.toLocaleString("nl-NL", { weekday: "long" });
          const activeServices = activeServicesForDate(
            restaurant?.service_periods,
            dayObj,
          );
          const rows: ServiceGridRow[] = TABLE_TYPES.map((t) => ({
            label: TABLE_LABELS[t],
            cells: Object.fromEntries(
              activeServices.map((s) => [
                s,
                occupancyForTableService(dayPct, t, s, selected),
              ]),
            ),
          }));
          // Sublabels: tijden voor deze specifieke dag per actieve
          // service. Bv. "12:00 – 15:00 · 2 shifts" onder "Lunch".
          const sublabels: Partial<Record<ServiceKey, string>> = {};
          for (const s of activeServices) {
            const t = serviceTimesForDay(
              restaurant?.service_periods,
              s,
              dayObj,
            );
            if (t) sublabels[s] = t;
          }
          return (
            <div className="day-view">
              <div className="day-view-head">
                <div className="day-view-title">
                  {dayName.charAt(0).toUpperCase() + dayName.slice(1)}{" "}
                  {selected} {monthName.toLowerCase()}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  padding: "8px 4px 4px",
                }}
              >
                <ServiceGrid
                  fillHeight
                  serviceKeys={activeServices}
                  rows={rows}
                  serviceSublabels={sublabels}
                  labelColumnWidth="72px"
                />
              </div>
            </div>
          );
        })()}

        {view === "week" && (() => {
          // Week-view per service-periode (Floris-redesign 2026-05-12):
          // 7 dag-rijen × N actieve services (max 3: ontbijt/lunch/
          // diner). Per cel: bezet-% voor die service op die dag,
          // gebaseerd op dag-overall-pct + service-multiplier.
          // Kolommen = unie van alle actieve services in de week:
          // dagen waar een service inactief is krijgen lege cel.
          const dayLabels = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];
          const todayStr = today.toISOString().slice(0, 10);
          const allServices: ServiceKey[] = [];
          const seenServices = new Set<ServiceKey>();
          const rowDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            const cell = occupancy.find((o) => o.date === dateStr);
            const fallbackPct = seededOccupancy(
              d.getDate(),
              mondayIndex(d.getDay()),
            );
            const pct = cell?.occupancy_pct ?? fallbackPct;
            const activeServices = activeServicesForDate(
              restaurant?.service_periods,
              d,
            );
            for (const s of activeServices) {
              if (!seenServices.has(s)) {
                seenServices.add(s);
                allServices.push(s);
              }
            }
            return {
              date: d,
              dateStr,
              pct,
              activeServices,
              isToday: dateStr === todayStr,
              dayLabel: dayLabels[i],
            };
          });
          // Stabiele service-volgorde: ontbijt → lunch → diner.
          const serviceOrder: ServiceKey[] = ["breakfast", "lunch", "dinner"];
          const serviceKeys = serviceOrder.filter((s) =>
            seenServices.has(s),
          );
          const rows: ServiceGridRow[] = rowDays.map((rd) => ({
            label: rd.dayLabel,
            emphasis: rd.isToday,
            cells: Object.fromEntries(
              rd.activeServices.map((s) => [
                s,
                occupancyForServiceOnDay(rd.pct, s, rd.date.getDate()),
              ]),
            ),
          }));
          // Sublabels: representatieve tijden voor elke service over
          // de hele week (meest-voorkomende start/eind/shifts).
          const datesArr = rowDays.map((rd) => rd.date);
          const sublabels: Partial<Record<ServiceKey, string>> = {};
          for (const s of serviceKeys) {
            const t = serviceTimesForRange(
              restaurant?.service_periods,
              s,
              datesArr,
            );
            if (t) sublabels[s] = t;
          }
          return (
            <div className="day-view">
              <div className="day-view-head">
                <div className="day-view-title">
                  {formatWeekRange(weekStart, weekEnd)}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  padding: "8px 4px 4px",
                }}
              >
                <ServiceGrid
                  fillHeight
                  serviceKeys={serviceKeys}
                  rows={rows}
                  serviceSublabels={sublabels}
                  labelColumnWidth="40px"
                />
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
