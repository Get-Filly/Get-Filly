import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";

// ============================================================
// <Input> + <Textarea>, gelabelde form-velden met optionele hint/error
// ============================================================
//
// Vervangt op termijn het manual-pattern in account-pagina:
//   <div className="form-field">
//     <label>Stoelen binnen</label>
//     <input type="number" value={...} onChange={...} />
//     <div className="hint">Optional hint text</div>
//   </div>
//
// Met deze component:
//   <Input
//     label="Stoelen binnen"
//     type="number"
//     value={form.capacity_seats ?? ""}
//     onChange={...}
//     hint="Voor het bepalen van bezettingsgraad"
//   />
//
// Voordelen:
//   - Auto-koppelt label aan input via htmlFor/id (a11y)
//   - Hint vs error state in één component (error overruled hint)
//   - `full` prop maakt de field grid-column: 1 / -1 (form-grid)
//   - Spread van standard <input>-attributes blijft werken
//
// Houdt bestaande .form-field/.form-field input CSS-classes, geen
// styling-drift met de rest van de pagina.
// ============================================================

let _autoId = 0;
function nextId(): string {
  _autoId += 1;
  return `ui-input-${_autoId}`;
}

type CommonProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  // True = grid-column: 1 / -1 in form-grid. Meestal voor textareas
  // of velden die de hele rij willen vullen (description, USPs).
  full?: boolean;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & CommonProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, full, id, className, ...rest },
  ref,
) {
  // Stable ID per render: useId zou ideaal zijn maar dit component
  // wordt vaak in non-React contexts (server-render snapshots) gebruikt.
  // Module-counter is goedkoop en deterministisch genoeg.
  const inputId = id ?? nextId();
  const wrapperClass = ["form-field", full && "full", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input id={inputId} ref={ref} {...rest} />
      {error ? (
        <div
          className="hint"
          style={{ color: "var(--color-danger)" }}
          role="alert"
        >
          {error}
        </div>
      ) : (
        hint && <div className="hint">{hint}</div>
      )}
    </div>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & CommonProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, full, id, className, ...rest },
    ref,
  ) {
    const inputId = id ?? nextId();
    const wrapperClass = ["form-field", full && "full", className]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={wrapperClass}>
        {label && <label htmlFor={inputId}>{label}</label>}
        <textarea id={inputId} ref={ref} {...rest} />
        {error ? (
          <div
            className="hint"
            style={{ color: "var(--color-danger)" }}
            role="alert"
          >
            {error}
          </div>
        ) : (
          hint && <div className="hint">{hint}</div>
        )}
      </div>
    );
  },
);
