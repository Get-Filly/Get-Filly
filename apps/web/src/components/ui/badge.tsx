import type { HTMLAttributes } from "react";

// ============================================================
// <Badge>, pill-stijl status-indicator
// ============================================================
//
// Gebruik voor: campagne-status (concept/ingepland/actief/afgerond),
// reservering-status (bevestigd/no_show/etc), Filly-attributie pills,
// en ander "type-of-thing"-labels.
//
// Variants:
//   neutral  , grijs, voor type-labels zonder status-betekenis
//   brand    , groen, voor brand-attributie ("via Filly")
//   success  , groen, voor positieve status (bevestigd, voltooid)
//   warning  , oranje, voor attention (no_show, ingeplande maar laat)
//   danger   , rood, voor problemen (geannuleerd, mislukt)
//   info     , blauw, voor neutrale info (nieuw, beta)
//
// Stijl-keuzes:
//   - Soft-color background + vol-color tekst geeft een papier-warme
//     uitstraling i.p.v. een vol-color block.
//   - Optioneel een puntje (●) ervoor voor extra zichtbaarheid bij
//     status-indicatoren, handig in tabellen.
// ============================================================

export type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  // Toont een vol-gekleurd cirkel-puntje voor de tekst. Verhoogt
  // herkenbaarheid in dichte tabellen.
  withDot?: boolean;
};

export function Badge({
  variant = "neutral",
  withDot = false,
  className,
  children,
  ...rest
}: Props) {
  const classes = [
    "ui-badge",
    `ui-badge--${variant}`,
    withDot && "ui-badge--with-dot",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {withDot && <span className="ui-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}
