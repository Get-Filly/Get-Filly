import type { ReactNode } from "react";

// ============================================================
// <Tabs> — filter-tabs met onderstreping voor de actieve tab
// ============================================================
//
// Vervangt het 5-regels-per-gebruik patroon dat in de codebase staat:
//   <div className="tabs">
//     {filters.map(f => (
//       <button
//         className={`tab-btn ${active === f.key ? "active" : ""}`}
//         onClick={() => setFilter(f.key)}
//       >{f.label}</button>
//     ))}
//   </div>
//
// Met deze component:
//   <Tabs
//     items={filters}
//     active={statusFilter}
//     onChange={setStatusFilter}
//   />
//
// Optioneel een count-badge per tab ("Alle (12)", "Actief (3)").
// ============================================================

export type TabItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  // Optioneel cijfer dat naast de label getoond wordt. Vaak een
  // count uit een filter ("Actief (3)") — handig om de eigenaar
  // te laten zien hoeveel rijen achter elke tab schuilgaan.
  count?: number;
};

type Props<K extends string> = {
  items: ReadonlyArray<TabItem<K>>;
  active: K;
  onChange: (next: K) => void;
  // Extra className voor de wrapper (bv. om margin-bottom te tweaken
  // op een specifieke pagina).
  className?: string;
};

export function Tabs<K extends string>({
  items,
  active,
  onChange,
  className,
}: Props<K>) {
  const wrapperClass = ["tabs", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass} role="tablist">
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? "active" : ""}`}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                style={{
                  marginLeft: 6,
                  color: isActive
                    ? "var(--color-brand)"
                    : "var(--color-text-disabled)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
