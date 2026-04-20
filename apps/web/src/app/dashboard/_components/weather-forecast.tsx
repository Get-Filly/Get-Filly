"use client";

import { useEffect, useState } from "react";
import { fetchWeather, type ForecastDay } from "../../../lib/api";

export function WeatherForecast() {
  const [days, setDays] = useState<ForecastDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWeather()
      .then(setDays)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">Weersvoorspelling</div>
            <div className="card-st" style={{ color: "var(--red)" }}>
              Fout: {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">Weersvoorspelling</div>
          <div className="card-st">
            {days.length ? "Aankomende 7 dagen · Open-Meteo" : "Laden..."}
          </div>
        </div>
      </div>
      <div className="card-b">
        <div className="weather-row">
          {days.map((w, i) => (
            <div
              key={w.date}
              className={`weather-day ${i === 0 ? "today" : ""}`}
            >
              <div className="wd-day">{w.dayLabel}</div>
              <div className="wd-icon">{w.icon}</div>
              <div className="wd-temp">{w.tempMax}°</div>
              <div className="wd-desc">{w.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
