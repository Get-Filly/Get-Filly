import { forwardRef, type ButtonHTMLAttributes } from "react";

// ============================================================
// <Button>, base-component voor de Get Filly UI
// ============================================================
//
// Vervangt 3 oude patterns die door de codebase verspreid stonden:
//   - .btn-primary-dash (dashboard.css)
//   - .sg-btn primary (publieke site)
//   - inline groene knoppen (style={{ background: 'var(--accent)' ... }})
//
// Variants:
//   primary   , groene CTA (hoofd-actie per scherm/sectie)
//   secondary , grijze rand, transparante achtergrond (alternatief)
//   ghost     , geen rand/bg, alleen tekst (links-achtige knoppen)
//   danger    , rode CTA (verwijder, annuleer-irreversible)
//
// Sizes:
//   sm , kleinere knoppen voor inline-acties (in tabel, in card-header)
//   md , default, gebruikt door 90% van de knoppen
//
// Belangrijk:
//   - type="button" is de DEFAULT (HTML's default is "submit", veroorzaakt
//     vaak per-ongeluk-form-submit-bugs).
//   - Standaard <button>-attributes (onClick, disabled, aria-*, etc) gaan
//     gewoon door dankzij ButtonHTMLAttributes-spread.
//   - forwardRef voor cases waar een ref nodig is (focus management,
//     tooltip-anchor, etc).
//
// Stijlen staan in ui.css zodat ze één plek hebben en hover/focus-states
// niet bij elke gebruik opnieuw geschreven hoeven worden.
// ============================================================

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  // brand-soft: licht-groene achtergrond (brand-soft) met donker-
  // groene tekst en border. Bij hover wisselt naar vol brand-groen
  // + wit tekst. Gebruikt voor secundaire CTA's die wel "merkmatig"
  // willen voelen (bv. menu-/drank-upload-knoppen op de menu-pagina).
  | "brand-soft"
  // danger-soft: licht-rode achtergrond met donker-rode tekst, hover
  // wisselt naar vol-rood + wit. Voor destructieve secundaire acties
  // (Afwijzen op voorstellen) die nog niet definitief verwijderen.
  | "danger-soft";
export type ButtonSize = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Optioneel icon LINKS van de tekst. Alleen rendering, caller zorgt
  // dat het icon de juiste kleur heeft (currentColor werkt vanzelf).
  iconLeft?: React.ReactNode;
  // Idem rechts. Voor pijltjes als "Bekijken →" of "Volgende ▶".
  iconRight?: React.ReactNode;
  // Toont een spinner i.p.v. de tekst en disabled de knop. Gebruik
  // voor async-actions zodat user dubbele clicks vermeden krijgt.
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    type = "button",
    className,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    loading && "ui-btn--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      // aria-busy zodat screen-readers weten dat de knop bezig is
      // tijdens een async-action.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden />}
      {!loading && iconLeft && (
        <span className="ui-btn__icon" aria-hidden>
          {iconLeft}
        </span>
      )}
      <span className="ui-btn__label">{children}</span>
      {!loading && iconRight && (
        <span className="ui-btn__icon" aria-hidden>
          {iconRight}
        </span>
      )}
    </button>
  );
});
