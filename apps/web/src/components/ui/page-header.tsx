import type { ReactNode } from "react";

// ============================================================
// <PageHeader>, uniforme titel-rij voor dashboard-pagina's
// ============================================================
//
// Lost een alignment-inconsistentie op die in de codebase zat:
// sommige pagina's gebruikten `<div className="page-header-row">`
// (titel links + CTA rechts), andere stackten alleen titel + subtitle
// zonder wrapper. Resultaat: rare offset bij scroll-vergelijking
// tussen pagina's.
//
// Deze component verbergt dat verschil. Je geeft altijd:
//   - title       (verplicht)
//   - subtitle    (optioneel)
//   - actions     (optioneel, knoppen / dropdowns rechts uitgelijnd)
//
// Bij geen actions stacked het automatisch (wat visueel gelijk is
// aan een title-only header). Bij wél actions wordt het een row.
//
// Stylebare via className als je iets bijzonders nodig hebt
// (bv. extra margin-bottom op een specifieke pagina).
// ============================================================

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: Props) {
  const wrapperClass = ["page-header-row", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass}>
      <div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            flexShrink: 0,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
