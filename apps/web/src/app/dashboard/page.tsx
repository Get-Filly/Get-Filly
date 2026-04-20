import { KpiRow } from "./_components/kpi-row";
import { WeatherForecast } from "./_components/weather-forecast";

export default function DashboardPage() {
  return (
    <div className="page">
      <div className="dash-top">
        <KpiRow />
      </div>
      <div className="dash-body">
        <div className="left-col">
          <WeatherForecast />
          <div style={{ color: "var(--tl)", fontSize: 13, padding: "8px 0" }}>
            Kalender, detail en grafiek komen hierna.
          </div>
        </div>
        <div className="right-col">
          <div style={{ color: "var(--tl)", fontSize: 13, padding: "20px 0" }}>
            Filly AI chat komt in fase 5.
          </div>
        </div>
      </div>
    </div>
  );
}
