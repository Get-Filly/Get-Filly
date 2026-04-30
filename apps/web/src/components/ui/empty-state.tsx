import type { ReactNode } from "react";

// ============================================================
// <EmptyState> — uniforme lege-staat voor lijsten/pagina's
// ============================================================
//
// In de codebase staan ~10 instances van het patroon
//   <div className="empty-state">
//     <div className="empty-title">...</div>
//     <div className="empty-desc">...</div>
//     {!error && <button>...</button>}
//   </div>
// telkens iets anders gestyled (margin-top, marginBottom-overrides,
// inconsistent of de CTA wel/niet getoond wordt). Deze component
// centraliseert dat zodat alle empty-states gelijk ogen + bij een
// design-tweak één plek aangeraakt hoeft.
//
// Variants:
//   default   — voor "nog geen data" (witte bg, dashed border)
//   error     — voor laad-fouten (zelfde structuur, alleen visueel
//               iets anders te onderscheiden via een optionele
//               error-prefix in de title — kleur blijft hetzelfde
//               omdat we eerder besloten dat empty-states rustig
//               ogen, niet alarmerend; rode banners alleen voor
//               user-action-fouten)
//
// Slot voor `action`: typisch een <Button>. Bewust ReactNode zodat
// je ook een Link-as-button of een tooltip-wrapper kan doorgeven.
// ============================================================

type Props = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  // Optionele icon (vaak emoji of Lucide-component) bovenaan.
  // We passen 'm in een 40px-wrapper aan zodat hij visueel klopt
  // met de typografie.
  icon?: ReactNode;
  // Margin van de empty-state binnen z'n parent. Defaulten naar 0
  // (caller bepaalt zelf met page-grid); pages die voorheen
  // marginTop:16 hardcodeerden kunnen `topGap` gebruiken voor
  // expliciete intentie zonder inline-style.
  topGap?: boolean;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  topGap = false,
  className,
}: Props) {
  const classes = ["empty-state", className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={topGap ? { marginTop: "var(--space-4)" } : undefined}
    >
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div>{action}</div>}
    </div>
  );
}
