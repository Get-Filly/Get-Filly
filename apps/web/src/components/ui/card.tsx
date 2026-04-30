import type { HTMLAttributes, ReactNode } from "react";

// ============================================================
// <Card> — neutrale wrapper met consistente padding/border/shadow
// ============================================================
//
// In de codebase staan tientallen `<div className="card">` met telkens
// dezelfde basis-stijl. Deze component centraliseert dat zodat een
// brand-spacing-tweak (bv. radius van 8px → 10px) op één plek hoeft.
//
// Sub-components:
//   <Card>          — wrapper
//   <CardHeader>    — titel + optionele subtitle + optionele rechter-actie
//   <CardBody>      — content-area
//   <CardFooter>    — actie-rij onderaan
//
// Padding is consistent (--space-5). Voor andere padding: pass `noPadding`
// en zet zelf padding op de child (bijv. tabellen die edge-to-edge moeten).
//
// `elevated` = met shadow (default). `flat` voor sub-cards binnen een card.
// ============================================================

type CardProps = HTMLAttributes<HTMLDivElement> & {
  noPadding?: boolean;
  elevated?: boolean;
};

export function Card({
  noPadding = false,
  elevated = true,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    "ui-card",
    elevated && "ui-card--elevated",
    noPadding && "ui-card--no-padding",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  // Rechts uitgelijnde actie-area (knop, badge, dropdown). Bewust
  // `ReactNode` zodat caller volledige vrijheid heeft.
  action?: ReactNode;
};

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="ui-card__header">
      <div className="ui-card__header-text">
        <div className="ui-card__title">{title}</div>
        {subtitle && <div className="ui-card__subtitle">{subtitle}</div>}
      </div>
      {action && <div className="ui-card__header-action">{action}</div>}
    </div>
  );
}

type CardBodyProps = HTMLAttributes<HTMLDivElement>;
export function CardBody({ className, children, ...rest }: CardBodyProps) {
  return (
    <div className={`ui-card__body ${className ?? ""}`.trim()} {...rest}>
      {children}
    </div>
  );
}

type CardFooterProps = HTMLAttributes<HTMLDivElement>;
export function CardFooter({ className, children, ...rest }: CardFooterProps) {
  return (
    <div className={`ui-card__footer ${className ?? ""}`.trim()} {...rest}>
      {children}
    </div>
  );
}
