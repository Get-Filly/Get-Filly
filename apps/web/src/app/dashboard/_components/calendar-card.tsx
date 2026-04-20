"use client";

import {
  mergeMonthData,
  occupancyClass,
  maandenNL,
} from "../_lib/calendar-data";
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
        {(view === "maand" || view === "dag") && (
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
                return (
                  <div
                    key={cell.day}
                    className={`cal-cell ${isToday ? "today" : ""} ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => onDayClick(cell.day)}
                  >
                    <div className="cal-dn">{cell.day}</div>
                    <div
                      className={`cal-occ ${occupancyClass(cell.occupancy)}`}
                    >
                      {cell.occupancy}%
                    </div>
                    {cell.occupancy >= 95 && (
                      <div className="cal-hot" title="Topdag">
                        🔥
                      </div>
                    )}
                    {cell.campaigns.length > 0 && (
                      <div className="cal-dots">
                        {cell.campaigns.map((c, idx) => (
                          <div key={idx} className={`cal-dot dot-${c}`} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

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
