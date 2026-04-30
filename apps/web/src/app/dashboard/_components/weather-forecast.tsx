"use client";

import { useEffect, useState } from "react";
import { fetchWeather, type ForecastDay } from "../../../lib/api";

type Status = "loading" | "ok" | "empty" | "error";

export function WeatherForecast() {
  const [days, setDays] = useState<ForecastDay[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetchWeather()
      .then((d) => {
        setDays(d);
        setStatus(d.length > 0 ? "ok" : "empty");
      })
      .catch(() => setStatus("error"));
  }, []);

  // Niet-OK states (loading/empty/error) renderen we als één compacte
  // card-rij. Voorkomt dat we 7 lege dag-vakjes onder elkaar krijgen
  // als de data nog niet binnen is of helemaal ontbreekt.
  if (status !== "ok") {
    const subtitle =
      status === "loading"
        ? "Filly haalt het weer op…"
        : status === "empty"
          ? "Geen weer-data beschikbaar — controleer je adres op de account-pagina."
          : "Nog niet beschikbaar — vul je adres aan op de account-pagina.";
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">Weersvoorspelling</div>
            <div className="card-st">{subtitle}</div>
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
          <div className="card-st">Aankomende 7 dagen · Open-Meteo</div>
        </div>
      </div>
      <div className="card-b">
        <div className="weather-row">
          {days.map((w, i) => {
            // Defensief: tempMax kan undefined/null zijn als Open-Meteo
            // geen volledig respons gaf (bv. coords ontbreken). Toon
            // dan een streepje ipv kale "°".
            const hasTemp =
              typeof w.tempMax === "number" && Number.isFinite(w.tempMax);
            const hasDesc =
              typeof w.description === "string" &&
              w.description.trim().length > 0;
            return (
              <div
                key={w.date}
                className={`weather-day ${i === 0 ? "today" : ""}`}
              >
                <div className="wd-day">{w.dayLabel}</div>
                <div className="wd-icon">{w.icon}</div>
                <div className="wd-temp">{hasTemp ? `${w.tempMax}°` : "—"}</div>
                {hasDesc && <div className="wd-desc">{w.description}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
