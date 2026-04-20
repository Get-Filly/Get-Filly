// Mock weer-data. Wordt later vervangen door /api/weather (KNMI of OpenWeatherMap).
const weather = [
  { d: "Ma", icon: "☀️", hi: 18, desc: "Zonnig" },
  { d: "Di", icon: "⛅", hi: 16, desc: "Bewolkt" },
  { d: "Wo", icon: "🌧️", hi: 12, desc: "Regen" },
  { d: "Do", icon: "🌧️", hi: 11, desc: "Regen" },
  { d: "Vr", icon: "⛅", hi: 15, desc: "Bewolkt" },
  { d: "Za", icon: "☀️", hi: 19, desc: "Zonnig" },
  { d: "Zo", icon: "☀️", hi: 20, desc: "Zonnig" },
];

export function WeatherForecast() {
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <div className="card-t">Weersvoorspelling</div>
          <div className="card-st">Aankomende 7 dagen</div>
        </div>
      </div>
      <div className="card-b">
        <div className="weather-row">
          {weather.map((w, i) => (
            <div
              key={w.d}
              className={`weather-day ${i === 0 ? "today" : ""}`}
            >
              <div className="wd-day">{w.d}</div>
              <div className="wd-icon">{w.icon}</div>
              <div className="wd-temp">{w.hi}°</div>
              <div className="wd-desc">{w.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
