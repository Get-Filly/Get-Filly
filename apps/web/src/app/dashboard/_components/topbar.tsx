"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";

const titleFor: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/taken": "Taken",
  "/dashboard/suggesties": "Suggesties",
  "/dashboard/reserveringen": "Reserveringen",
  "/dashboard/campagnes": "Campagnes",
  "/dashboard/gasten": "Gasten",
  // Vindbaarheid-hub + sub-routes (per 2026-05-21 hernoemd van
  // "Google Business" naar "Vindbaarheid" — GBP is één onderdeel
  // binnen vindbaarheid, en de naam sluit aan op pijler 1 op de
  // marketing-site).
  "/dashboard/google-business": "Vindbaarheid",
  "/dashboard/google-business/reviews": "Vindbaarheid · Reviews",
  // Marketing-hub + sub-routes per kanaal.
  "/dashboard/marketing": "Marketing",
  "/dashboard/marketing/mail": "Marketing · Mail",
  "/dashboard/marketing/instagram": "Marketing · Instagram",
  "/dashboard/marketing/facebook": "Marketing · Facebook",
  "/dashboard/marketing/tiktok": "Marketing · TikTok",
  "/dashboard/menu": "Menu",
  "/dashboard/rapportages": "Rapportages",
  "/dashboard/koppelingen": "Koppelingen",
  "/dashboard/account": "Account",
};

// Toggle de mobile-nav via een class op <body>. Geen Context/Provider
// nodig, sidebar reageert via dezelfde body-class. Bij eerste klik
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
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Burger-knop alleen zichtbaar onder 1024px (CSS-controlled).
            Klik toggle't .mobile-nav-open op body, sidebar slidet erin. */}
        <button
          type="button"
          className="tb-burger"
          aria-label="Menu"
          onClick={toggleMobileNav}
        >
          <Menu size={18} />
        </button>
        <div className="tb-title">{title}</div>
      </div>
      <div className="tb-right">
        <span className="tb-badge tb-badge-desktop">
          Laatste sync: 2 min geleden
        </span>
        {/* Notificaties + zoeken zijn nog placeholder, komen straks
            (zie backlog P3). Lucide-iconen i.p.v. emoji's zodat de
            chrome er nu al consistent uitziet met de rest van de UI. */}
        <button type="button" className="tb-btn" aria-label="Notificaties">
          <Bell size={16} />
        </button>
        <button type="button" className="tb-btn" aria-label="Zoeken">
          <Search size={16} />
        </button>
      </div>
    </div>
  );
}
