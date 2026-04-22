"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type Module } from "@getfilly/shared";
import { createClient } from "../../../lib/supabase-browser";
import { useRestaurant } from "../../../lib/restaurant-context";

/**
 * Menu-definitie met een module-key per item.
 * De module-keys komen uit @getfilly/shared — zo zijn ze exact gelijk
 * aan wat de backend kent. Geen typfouten mogelijk.
 */
type MenuItem = {
  href: string;
  icon: string;
  label: string;
  module: Module;
};

const allMenuItems: MenuItem[] = [
  { href: "/dashboard", icon: "📊", label: "Dashboard", module: "dashboard" },
  { href: "/dashboard/taken", icon: "📥", label: "Taken", module: "taken" },
  { href: "/dashboard/suggesties", icon: "💡", label: "Suggesties", module: "suggesties" },
  { href: "/dashboard/reserveringen", icon: "📆", label: "Reserveringen", module: "reserveringen" },
  { href: "/dashboard/campagnes", icon: "📣", label: "Campagnes", module: "campagnes" },
  { href: "/dashboard/gasten", icon: "👥", label: "Gasten", module: "gasten" },
  { href: "/dashboard/reviews", icon: "⭐", label: "Reviews", module: "reviews" },
  { href: "/dashboard/menu", icon: "🍽️", label: "Menu", module: "menu" },
  { href: "/dashboard/rapportages", icon: "📈", label: "Rapportages", module: "rapportages" },
  { href: "/dashboard/koppelingen", icon: "🔗", label: "Koppelingen", module: "koppelingen" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Actieve restaurant + permissies uit de context. Als deze nog niet
  // geladen is (bv. bij eerste render), gebruiken we een lege lijst —
  // dan tonen we kortstondig geen menu-items tot de context klaar is.
  const { active, loading } = useRestaurant();
  const permissions = active?.permissions ?? [];

  // Filter het menu: toon alleen items waar de user toegang tot heeft.
  // Tijdens laden tonen we ALLE items (optimistisch) om flikkering te
  // voorkomen — ze zijn toch niet klikbaar als de backend ze zou
  // weigeren.
  const menuItems = loading
    ? allMenuItems
    : allMenuItems.filter((item) => permissions.includes(item.module));

  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  // Sluit dropdown bij klik buiten of Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  };

  // Account-instellingen in het dropdown-menu alleen tonen als de user
  // de 'account'-module mag zien (defaults: iedereen).
  const canSeeAccount = loading || permissions.includes("account");

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="sidebar">
      {/* Workspace-blok bovenin — klikbaar, opent account-dropdown. */}
      <div className="sb-workspace-wrap" ref={menuRef}>
        <button
          type="button"
          className={`sb-workspace ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Account-menu"
        >
          <div className="sb-avatar">BG</div>
          <div className="sb-workspace-text">
            <div className="sb-uname">{active?.name ?? "—"}</div>
            <div className="sb-urole" title={email ?? ""}>
              {email ?? (active?.role ?? "…")}
            </div>
          </div>
          <span className="sb-chevron" aria-hidden>▾</span>
        </button>

        {menuOpen && (
          <div className="sb-workspace-menu" role="menu">
            {canSeeAccount && (
              <Link
                href="/dashboard/account"
                className="sb-menu-item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <span className="sb-menu-icon">⚙️</span>
                Account-instellingen
              </Link>
            )}
            {canSeeAccount && <div className="sb-menu-divider" aria-hidden />}
            <button
              type="button"
              className="sb-menu-item sb-menu-danger"
              role="menuitem"
              onClick={handleLogout}
            >
              <span className="sb-menu-icon">↩</span>
              Uitloggen
            </button>
          </div>
        )}
      </div>

      <div className="sb-section">
        <div className="sb-label">Menu</div>
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item ${isActive(item.href) ? "active" : ""}`}
          >
            <span className="sb-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="sb-bottom">
        <Link href="/" className="sb-site-link">
          ← Bekijk website
        </Link>
      </div>
    </nav>
  );
}
