"use client";

import { useState } from "react";
import {
  getMonthData,
  occupancyClass,
  maandenNL,
} from "../_lib/calendar-data";

type View = "dag" | "maand" | "jaar";

const weekdays = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

export function CalendarCard() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [view, setView] = useState<View>("maand");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const cells = getMonthData(viewYear, viewMonth);

  const label = `${maandenNL[viewMonth].charAt(0).toUpperCase() +
    maandenNL[viewMonth].slice(1)} ${viewYear}`;

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
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
    setSelectedDay(null);
  };

  const isTodayMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const todayNum = today.getDate();

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
                onClick={() => setView(v)}
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
                if (!cell) return <div key={`e-${i}`} className="cal-cell empty" />;
                const isToday = isTodayMonth && cell.day === todayNum;
                const isSelected = selectedDay === cell.day;
                return (
                  <div
                    key={cell.day}
                    className={`cal-cell ${isToday ? "today" : ""} ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => setSelectedDay(cell.day)}
                  >
                    <div className="cal-dn">{cell.day}</div>
                    <div className={`cal-occ ${occupancyClass(cell.occupancy)}`}>
                      {cell.occupancy}%
                    </div>
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

        {view === "dag" && (
          <div style={{ padding: "20px 4px", color: "var(--tl)", fontSize: 13 }}>
            Dagweergave komt in Fase 6.
          </div>
        )}

        {view === "jaar" && (
          <div style={{ padding: "20px 4px", color: "var(--tl)", fontSize: 13 }}>
            Jaarweergave komt in Fase 6.
          </div>
        )}
      </div>
    </div>
  );
}
