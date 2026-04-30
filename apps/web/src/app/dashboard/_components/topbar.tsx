"use client";

import { usePathname } from "next/navigation";

const titleFor: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/taken": "Taken",
  "/dashboard/suggesties": "Suggesties",
  "/dashboard/reserveringen": "Reserveringen",
  "/dashboard/campagnes": "Campagnes",
  "/dashboard/gasten": "Gasten",
  "/dashboard/reviews": "Reviews",
  "/dashboard/menu": "Menu",
  "/dashboard/rapportages": "Rapportages",
  "/dashboard/koppelingen": "Koppelingen",
  "/dashboard/account": "Account",
};

// Toggle de mobile-nav via een class op <body>. Geen Context/Provider
// nodig — sidebar reageert via dezelfde body-class. Bij eerste klik
// op een desktop heeft de class geen effect (CSS-rules met breakpoints
// kicken pas in onder 1024px).
function toggleMobileNav() {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("mobile-nav-open");
}

export function Topbar() {
  const pathname = usePathname();
  const title = titleFor[pathname] ?? "Dashboard";

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Burger-knop alleen zichtbaar onder 1024px (CSS-controlled).
            Klik toggle't .mobile-nav-open op body — sidebar slidet erin. */}
        <button
          type="button"
          className="tb-burger"
          aria-label="Menu"
          onClick={toggleMobileNav}
        >
          ☰
        </button>
        <div className="tb-title">{title}</div>
      </div>
      <div className="tb-right">
        <span className="tb-badge tb-badge-desktop">
          Laatste sync: 2 min geleden
        </span>
        <div className="tb-btn">🔔</div>
        <div className="tb-btn">🔍</div>
      </div>
    </div>
  );
}
