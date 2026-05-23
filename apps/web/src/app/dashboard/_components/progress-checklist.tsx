"use client";

// ============================================================
// ProgressChecklist, gedeelde voortgang-component
// ============================================================
// Per 2026-05-21 (Floris-feedback): vervangt zowel de aparte
// account-onboarding-checklist als de identiteit-checklist met
// één consistente UI/UX. Belangrijkste regels:
//
//   - Done-items verdwijnen UIT de lijst (niet line-through)
//   - Max 4 open items zichtbaar; "Toon nog X" voor de rest
//   - Collapse-toggle (chevron) i.p.v. permanente dismiss
//   - Bij 100% verdwijnt 't blok helemaal
//
// Collapse-state wordt opgeslagen in localStorage per
// `collapseKey`, zodat refresh de keuze onthoudt. localStorage
// is per-browser, dus eigenaar kan op telefoon nog uitgeklapt
// hebben terwijl het op de laptop ingeklapt is — bewust niet
// in DB om dezelfde reden als de oude dismiss-flag.
//
// Geen Link/href per item: deze checklists staan altijd op
// dezelfde pagina als de bijbehorende velden, eigenaar scrollt
// gewoon naar het juiste blok of klikt op een sub-tab.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type ProgressChecklistItem = {
  id: string;
  label: string;
  hint?: string;
  // Optioneel: linkt naar een andere pagina (gebruikt door de
  // account-checklist die ook naar /campagnes etc. wijst).
  href?: string;
  done: boolean;
};

type Props = {
  items: ProgressChecklistItem[];
  title?: string;
  hint?: string;
  // Hoeveel open items tonen we standaard? Bij meer komt er
  // een "Toon nog N"-knop. Default 4 want op kleinere schermen
  // gaat 5+ items te veel ruimte kosten.
  visibleLimit?: number;
  // localStorage-key voor collapsed-state. Als weggelaten is
  // de checklist altijd open (geen toggle-knop dan).
  collapseKey?: string;
};

export function ProgressChecklist({
  items,
  title = "Voortgang",
  hint,
  visibleLimit = 4,
  collapseKey,
}: Props) {
  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const openItems = items.filter((i) => !i.done);
  const percent = total === 0 ? 100 : Math.round((doneCount / total) * 100);
  const allDone = total > 0 && doneCount === total;

  // Toon-meer-toggle: alle open items zichtbaar of de eerste N?
  const [expandAll, setExpandAll] = useState(false);

  // Collapse-toggle: hele card ingeklapt (alleen titel + progress
  // zichtbaar) vs uitgeklapt (items zichtbaar). Initial waarde
  // uit localStorage zodat refresh de keuze onthoudt.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    try {
      const stored = localStorage.getItem(collapseKey);
      if (stored === "true") setCollapsed(true);
    } catch {
      // localStorage geblokkeerd (privacy-mode): default uitgeklapt.
    }
  }, [collapseKey]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (collapseKey) {
      try {
        localStorage.setItem(collapseKey, next ? "true" : "false");
      } catch {
        // Niet kritiek; state blijft in-memory.
      }
    }
  };

  // Renderen we niks als alles klaar is OF geen items aanwezig.
  // De caller hoeft dat dus niet zelf te checken.
  if (total === 0 || allDone) return null;

  const visibleItems = expandAll
    ? openItems
    : openItems.slice(0, visibleLimit);
  const hiddenCount = openItems.length - visibleItems.length;

  return (
    <div
      style={{
        background: "var(--surface, #FAF7F1)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: "var(--radius, 8px)",
        padding: 20,
        marginBottom: 16,
      }}
    >
      {/* Header: titel + counter + chevron-toggle. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "var(--accent-dark, #1F4A2D)",
            fontSize: 14,
          }}
        >
          {title}
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary, #52525B)",
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              marginLeft: 8,
            }}
          >
            · {doneCount} van {total} ingevuld
          </span>
        </div>
        {collapseKey && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Toon items" : "Inklappen"}
            aria-label={collapsed ? "Toon items" : "Inklappen"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary, #52525B)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: "var(--radius-sm, 6px)",
            }}
          >
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        )}
      </div>

      {hint && !collapsed && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            marginBottom: 12,
          }}
        >
          {hint}
        </div>
      )}

      {/* Progress-bar: ALTIJD zichtbaar, ook in ingeklapte staat,
          zodat eigenaar in één oogopslag weet hoe ver hij is. */}
      <div
        style={{
          height: 6,
          background: "var(--border, #E5DFD0)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: collapsed ? 0 : 16,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background:
              percent === 100
                ? "var(--accent, #1F4A2D)"
                : "#F59E0B",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Items + show-more, alleen als niet collapsed. */}
      {!collapsed && (
        <>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {visibleItems.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--white, #FFFFFF)",
                  borderRadius: "var(--radius-sm, 6px)",
                  border: "1px solid var(--border-soft, #E5DFD0)",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 2,
                    background: "var(--bg, #FAF7F1)",
                    border: "1px solid var(--border, #E5DFD0)",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text, #18181B)",
                    }}
                  >
                    {item.label}
                  </div>
                  {item.hint && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary, #52525B)",
                        marginTop: 2,
                      }}
                    >
                      {item.hint}
                    </div>
                  )}
                </div>
                {item.href && (
                  <Link
                    href={item.href}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent, #1F4A2D)",
                      textDecoration: "none",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  >
                    Instellen →
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandAll(true)}
              style={{
                marginTop: 10,
                background: "transparent",
                border: "none",
                color: "var(--accent, #1F4A2D)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              Toon nog {hiddenCount} {hiddenCount === 1 ? "item" : "items"} ↓
            </button>
          )}
          {expandAll && openItems.length > visibleLimit && (
            <button
              type="button"
              onClick={() => setExpandAll(false)}
              style={{
                marginTop: 10,
                background: "transparent",
                border: "none",
                color: "var(--text-secondary, #52525B)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              Minder tonen ↑
            </button>
          )}
        </>
      )}
    </div>
  );
}
