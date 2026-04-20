type Kpi = {
  label: string;
  value: string;
  trend: string;
  trendDir: "up" | "down" | "neutral";
};

// Mock-data. Wordt later vervangen door data uit /api/kpi (backend).
const bezettingVandaag = 62;
const gemZelfdeWeekdag = 68; // gem. van dezelfde weekdag over afgelopen 6 mnd
const bezettingDezeMaand = 68;

const diffVandaag = bezettingVandaag - gemZelfdeWeekdag;
const diffDir: Kpi["trendDir"] =
  diffVandaag > 0 ? "up" : diffVandaag < 0 ? "down" : "neutral";
const diffArrow = diffVandaag > 0 ? "↑" : diffVandaag < 0 ? "↓" : "—";

const huidigeMaand = new Date().toLocaleString("nl-NL", { month: "long" });

const kpis: Kpi[] = [
  {
    label: "Bezetting vandaag",
    value: `${bezettingVandaag}%`,
    trend: `${diffArrow} ${Math.abs(diffVandaag)}%`,
    trendDir: diffDir,
  },
  {
    label: `Bezetting ${huidigeMaand}`,
    value: `${bezettingDezeMaand}%`,
    trend: "↑ 4%",
    trendDir: "up",
  },
  {
    label: `Gasten ${huidigeMaand}`,
    value: "1.284",
    trend: "↑ 12%",
    trendDir: "up",
  },
  {
    label: "Voorgestelde campagnes",
    value: "3",
    trend: "ter goedkeuring",
    trendDir: "neutral",
  },
  {
    label: `Geschatte omzet ${huidigeMaand}`,
    value: "€53.900",
    trend: "↑ 8%",
    trendDir: "up",
  },
];

const trendClass = {
  up: "tu",
  down: "td",
  neutral: "tn",
};

export function KpiRow() {
  return (
    <div className="kpi-row">
      {kpis.map((k) => (
        <div key={k.label} className="kpi">
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-ri">
            <span className="kpi-val">{k.value}</span>
            <span className={`kpi-trend ${trendClass[k.trendDir]}`}>
              {k.trend}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
