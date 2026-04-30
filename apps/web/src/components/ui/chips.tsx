import type { ReactNode } from "react";

// ============================================================
// <Chips> — pill-stijl filter-knoppen (multi-keuze of single-select)
// ============================================================
//
// Verschilt van <Tabs> in twee opzichten:
//   1. Visueel: rounded-pills met border (horizontaal scrollbaar
//      indien nodig), niet onderstreping-stijl.
//   2. Optionele icon per chip — handig voor type-filters waarbij
//      de eigenaar visueel snel "mail vs social vs whatsapp" wil
//      onderscheiden.
//
// Vervangt het patroon in campagnes-pagina:
//   <div className="type-chips">
//     {options.map(t => (
//       <button
//         className={`type-chip ${active === t.key ? "active" : ""}`}
//         onClick={() => setActive(t.key)}
//       >
//         <span>{t.icon}</span> {t.label}
//       </button>
//     ))}
//   </div>
//
// Met deze component:
//   <Chips
//     items={typeFilterOptions}
//     active={typeFilter}
//     onChange={setTypeFilter}
//   />
//
// Hergebruikt bestaande .type-chips + .type-chip CSS — geen
// styling-drift.
// ============================================================

export type ChipItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  // Optioneel emoji of Lucide-icon vóór de label. Compacte chip
  // (icon + 1 woord) is de meest gebruikte vorm.
  icon?: ReactNode;
};

type Props<K extends string> = {
  items: ReadonlyArray<ChipItem<K>>;
  active: K;
  onChange: (next: K) => void;
  className?: string;
};

export function Chips<K extends string>({
  items,
  active,
  onChange,
  className,
}: Props<K>) {
  const wrapperClass = ["type-chips", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass} role="group">
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            className={`type-chip ${isActive ? "active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(item.key)}
          >
            {item.icon && <span aria-hidden>{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
