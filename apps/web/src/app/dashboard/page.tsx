import { KpiRow } from "./_components/kpi-row";

export default function DashboardPage() {
  return (
    <div className="page">
      <div className="dash-top">
        <KpiRow />
      </div>
      <div className="dash-body">
        <div className="left-col">
          <div style={{ color: "var(--tl)", fontSize: 13, padding: "20px 0" }}>
            Weer, kalender, detail en grafiek komen in de volgende fases.
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
