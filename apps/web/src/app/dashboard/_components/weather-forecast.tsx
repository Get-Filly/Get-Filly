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

  // Bij een fout (bv. coords missen omdat onboarding nog niet klaar is)
  // tonen we een rustige info-melding in plaats van een rode HTTP-fout.
  // De gebruiker kan z'n adres aanvullen op de account-pagina; tot
  // die tijd is "weer niet beschikbaar" een prima signaal.
  if (error) {
    return (
      <div className="card">
        <div className="card-h">
          <div>
            <div className="card-t">Weersvoorspelling</div>
            <div className="card-st">
              Nog niet beschikbaar — vul je adres aan op de account-pagina.
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
