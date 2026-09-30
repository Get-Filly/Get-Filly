"use client";

// Aan/uit-schakelaar, links uitgelijnd met de tekst ernaast.
//
// Waarom geen checkbox: binnen `.form-field` krijgt elk <input> width 100% en
// padding, waardoor een vinkje midden in de rij terechtkwam. Een knop heeft
// dat probleem niet.

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "2px 0 12px",
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 38,
          height: 22,
          borderRadius: 11,
          border: "none",
          padding: 2,
          cursor: "pointer",
          background: checked ? "#1F4A2D" : "#CFC9B8",
          display: "flex",
          justifyContent: checked ? "flex-end" : "flex-start",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        />
      </button>
      <span
        onClick={() => onChange(!checked)}
        style={{
          fontSize: 14,
          cursor: "pointer",
          color: "var(--text, #18181B)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
