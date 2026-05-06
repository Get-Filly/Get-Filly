import type { ReactNode } from "react";
import Link from "next/link";
import type { ButtonVariant, ButtonSize } from "./button";

// ============================================================
// <ButtonLink>, Button-stijl op een Next.js Link
// ============================================================
//
// Voor gevallen waar je SEMANTISCH een navigatie-link nodig hebt
// (rechtsklik "open in nieuw tabblad" werkt, browser-prefetch werkt,
// SEO-friendly) maar VISUEEL een knop wilt tonen.
//
// Gebruik:
//   <ButtonLink href="/dashboard/menu" variant="secondary">
//     Open menu-pagina
//   </ButtonLink>
//
// Verschil met <Button>:
//   - geen disabled/loading (Links gaan altijd door)
//   - geen onClick handler (gebruik Button als je iets moet doen i.p.v. navigeren)
//   - href is verplicht
//
// Hergebruikt dezelfde .ui-btn--*-classes uit ui.css zodat de
// styling exact gelijk is, geen risico op visuele drift tussen
// een knop en een link-as-knop.
// ============================================================

type Props = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  className?: string;
  // External link? target=_blank + rel=noopener voor security.
  external?: boolean;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  children,
  className,
  external = false,
}: Props) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // External links via gewone <a> (Next.js Link is voor in-app
  // navigation). Beide krijgen dezelfde classes.
  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
      >
        {iconLeft && (
          <span className="ui-btn__icon" aria-hidden>
            {iconLeft}
          </span>
        )}
        <span className="ui-btn__label">{children}</span>
        {iconRight && (
          <span className="ui-btn__icon" aria-hidden>
            {iconRight}
          </span>
        )}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {iconLeft && (
        <span className="ui-btn__icon" aria-hidden>
          {iconLeft}
        </span>
      )}
      <span className="ui-btn__label">{children}</span>
      {iconRight && (
        <span className="ui-btn__icon" aria-hidden>
          {iconRight}
        </span>
      )}
    </Link>
  );
}
