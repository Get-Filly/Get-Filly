"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase-browser";

// Hoofd-navigatie: alle werkpagina's (inclusief Koppelingen, want
// die gebruikt een klant dagelijks voor integraties).
const menu = [
  { href: "/dashboard", icon: "📊", label: "Dashboard" },
  { href: "/dashboard/taken", icon: "📥", label: "Taken" },
  { href: "/dashboard/suggesties", icon: "💡", label: "Suggesties" },
  { href: "/dashboard/reserveringen", icon: "📆", label: "Reserveringen" },
  { href: "/dashboard/campagnes", icon: "📣", label: "Campagnes" },
  { href: "/dashboard/gasten", icon: "👥", label: "Gasten" },
  { href: "/dashboard/reviews", icon: "⭐", label: "Reviews" },
  { href: "/dashboard/menu", icon: "🍽️", label: "Menu" },
  { href: "/dashboard/rapportages", icon: "📈", label: "Rapportages" },
  { href: "/dashboard/koppelingen", icon: "🔗", label: "Koppelingen" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // E-mail van de ingelogde user (wordt async opgehaald bij mount).
  const [email, setEmail] = useState<string | null>(null);

  // Staat het workspace-menu (dropdown bovenin) open?
  const [menuOpen, setMenuOpen] = useState(false);

  // Referentie naar het workspace-blok in de DOM — nodig om klikken
  // buiten het menu te detecteren en het dan te sluiten.
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Haal de ingelogde user op zodra het component laadt.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  // Sluit het menu bij klik buiten het menu + bij Escape-toets.
  useEffect(() => {
    if (!menuOpen) return;

    const onClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
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

  // Uitloggen: vertel Supabase dat de sessie afgelopen is, dan door naar /login.
  // router.refresh() zorgt dat Server Components opnieuw de (nu lege) sessie lezen.
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  };

  // Helper: is het huidige pad het pad van dit menu-item?
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="sidebar">
      {/*
        Workspace-blok bovenin — vervangt het oude "Get-Filly"-logo.
        Klik → dropdown opent met Account-instellingen + Uitloggen.
        Toont de bedrijfsnaam van de klant (niet het productmerk), want
        de gebruiker werkt in zíjn eigen bistro.
      */}
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
            <div className="sb-uname">Bistro Get-Filly</div>
            <div className="sb-urole" title={email ?? ""}>
              {email ?? "Pro plan"}
            </div>
          </div>
          <span className="sb-chevron" aria-hidden>▾</span>
        </button>

        {menuOpen && (
          <div className="sb-workspace-menu" role="menu">
            <Link
              href="/dashboard/account"
              className="sb-menu-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              <span className="sb-menu-icon">⚙️</span>
              Account-instellingen
            </Link>
            <div className="sb-menu-divider" aria-hidden />
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
        {menu.map((item) => (
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
