"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

// Pad → message-key onder dashboard.topbar.titles. usePathname uit
// @/i18n/navigation geeft het pad ZONDER locale-prefix, dus deze keys
// matchen op zowel NL als /en.
const titleKeyFor: Record<string, string> = {
  "/dashboard": "dashboard",
  "/dashboard/taken": "taken",
  "/dashboard/suggesties": "suggesties",
  "/dashboard/reserveringen": "reserveringen",
  "/dashboard/campagnes": "campagnes",
  "/dashboard/gasten": "gasten",
  // Vindbaarheid-hub + sub-routes (per 2026-05-21 hernoemd van
  // "Google Business" naar "Vindbaarheid").
  "/dashboard/google-business": "findability",
  "/dashboard/google-business/reviews": "findabilityReviews",
  // Marketing-hub + sub-routes per kanaal.
  "/dashboard/marketing": "marketing",
  "/dashboard/marketing/mail": "marketingMail",
  "/dashboard/marketing/instagram": "marketingInstagram",
  "/dashboard/marketing/facebook": "marketingFacebook",
  "/dashboard/marketing/tiktok": "marketingTiktok",
  "/dashboard/menu": "menu",
  "/dashboard/rapportages": "rapportages",
  "/dashboard/koppelingen": "koppelingen",
  "/dashboard/account": "account",
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
  const t = useTranslations("dashboard.topbar");
  const titleKey = titleKeyFor[pathname] ?? "dashboard";
  const title = t(`titles.${titleKey}`);

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {/* Burger-knop alleen zichtbaar onder 1024px (CSS-controlled).
            Klik toggle't .mobile-nav-open op body, sidebar slidet erin. */}
        <button
          type="button"
          className="tb-burger"
          aria-label={t("menu")}
          onClick={toggleMobileNav}
        >
          <Menu size={18} />
        </button>
        <div className="tb-title">{title}</div>
      </div>
      <div className="tb-right">
        <span className="tb-badge tb-badge-desktop">{t("lastSync")}</span>
        {/* Notificaties + zoeken zijn nog placeholder, komen straks
            (zie backlog P3). */}
        <button type="button" className="tb-btn" aria-label={t("notifications")}>
          <Bell size={16} />
        </button>
        <button type="button" className="tb-btn" aria-label={t("search")}>
          <Search size={16} />
        </button>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
