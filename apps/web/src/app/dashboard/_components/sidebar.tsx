"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type Module } from "@getfilly/shared";
import { createClient } from "../../../lib/supabase-browser";
import { useRestaurant } from "../../../lib/restaurant-context";

/**
 * Menu-definitie met een module-key per item.
 * De module-keys komen uit @getfilly/shared, zo zijn ze exact gelijk
 * aan wat de backend kent. Geen typfouten mogelijk.
 */
type MenuItem = {
  href: string;
  label: string;
  module: Module;
  // Emoji-icoon links naast het label. Per 2026-05-06 weer
  // ingevoerd nadat de tekst-only variant te kaal aanvoelde.
  icon: string;
};

// Sidebar-volgorde (per 2026-05-05 herzien):
//   1. Dashboard      , globaal overzicht (vaste start)
//   2. Campagnes      , dé pagina, bundelt Filly's voorstellen
//   3. Google Business, profiel + reviews + audit + benchmark
//   4. Reserveringen  , dagelijkse operatie
//   5. Gasten         , wie zijn de stamgasten
//   6. Menu           , gerechten + drank + Filly's voorstellen
//   7. Rapportages    , periodieke analyse
//   8. Koppelingen    , setup, zelden aangeraakt
//
// Twee items zijn eerder verwijderd als menu-item (routes bestaan nog
// voor legacy-links + detail-views):
//   - /dashboard/suggesties, opgegaan in de voorstellen-strip op
//     /dashboard/campagnes
//   - /dashboard/taken, verzamelpagina van Filly-acties die deels
//     onder Campagnes is opgegaan. Latere "Acties"-hub vervangt 'm.
const allMenuItems: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard", icon: "📊" },
  { href: "/dashboard/campagnes", label: "Campagnes", module: "campagnes", icon: "📣" },
  // Marketing-hub uit sidebar verwijderd 2026-05-12: kanaal-overzicht
  // is verhuisd naar /dashboard/rapportages (top-blokken). Route
  // /dashboard/marketing bestaat nog voor backwards-compat met
  // bestaande deep-links; kan in latere cleanup-sessie weg.
  // Per 2026-05-21: label "Google Business" → "Vindbaarheid". Sluit aan
  // bij pijler 1 op de marketing-site. GBP is één onderdeel binnen
  // vindbaarheid (audit, reviews, benchmark); de overkoepelende naam
  // dekt de lading beter. Route + module-key blijven google-business /
  // google_business voor backwards-compat met deep-links + permissies.
  { href: "/dashboard/google-business", label: "Vindbaarheid", module: "google_business", icon: "🔍" },
  { href: "/dashboard/reserveringen", label: "Reserveringen", module: "reserveringen", icon: "📅" },
  // Gasten-pagina uit sidebar verwijderd 2026-05-12: gast-info zit
  // nu inline in elke reservering-rij (totaal bezoeken, laatste
  // bezoek). Route /dashboard/gasten blijft bestaan voor deep-links.
  // Menu-pagina uit sidebar verwijderd 2026-05-21: menu-beheer is
  // verplaatst naar Vindbaarheid → Identiteit (Menu-subtab), waar
  // het samen met andere identiteit-velden zit die Filly gebruikt
  // voor posts. Route /dashboard/menu blijft bestaan voor deep-links.
  { href: "/dashboard/rapportages", label: "Rapportages", module: "rapportages", icon: "📈" },
  // Koppelingen-hub uit sidebar verwijderd 2026-05-12: alle integraties
  // zitten nu in account → Profiel → Koppelingen-tab. Route
  // /dashboard/koppelingen bestaat nog voor backwards-compat.
];

/**
 * Pak initialen uit een restaurant-naam voor de mini-avatar.
 * "Bistro Get-Filly" → "BG", "Cafe Get-Filly" → "CG",
 * "Filly" → "FI" (eerste twee letters als er maar één woord is).
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Vertaal de rolsleutel (zoals opgeslagen in de DB) naar het
 * NL-label dat de gebruiker ziet. Gelijkgetrokken met wat de
 * Team-pagina toont, zodat er maar één set labels rondzwerft.
 */
function roleLabel(role: "owner" | "manager" | "staff"): string {
  switch (role) {
    case "owner":
      return "Eigenaar";
    case "manager":
      return "Manager";
    case "staff":
      return "Medewerker";
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Actieve restaurant + volledige lijst uit de context. De lijst
  // gebruiken we voor de workspace-switcher; `setActive` schrijft de
  // keuze naar localStorage zodat een refresh hem onthoudt.
  const { active, restaurants, setActive, loading } = useRestaurant();
  const permissions = active?.permissions ?? [];

  // Filter het menu: toon alleen items waar de user toegang tot heeft.
  // Tijdens laden tonen we ALLE items (optimistisch) om flikkering te
  // voorkomen, ze zijn toch niet klikbaar als de backend ze zou
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

  /**
   * Wissel naar een ander restaurant.
   *
   * WAAROM window.location.reload():
   *   Veel dashboard-pagina's fetchen data in een useEffect met een
   *   lege dependency-array. Als we alleen de context updaten blijft
   *   die data van het vórige restaurant in client-state hangen,
   *   cross-tenant leak. Een harde reload garandeert dat álle data
   *   vers uit de backend komt voor het nieuwe actieve restaurant.
   *   Past bij onze "zero data-mix tussen tenants"-eis.
   *
   * `router.refresh()` is hier niet voldoende: dat ververst alleen
   * server-components, niet de client-state waar de meeste fetches
   * wonen.
   */
  const handleSwitchRestaurant = (id: string) => {
    if (id === active?.id) {
      setMenuOpen(false);
      return;
    }
    setActive(id);
    setMenuOpen(false);
    window.location.reload();
  };

  // Account-instellingen in het dropdown-menu alleen tonen als de user
  // de 'account'-module mag zien (defaults: iedereen).
  const canSeeAccount = loading || permissions.includes("account");

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  // Sluit de mobile-nav (offcanvas-mode <1024px) na klik op een
  // menu-link. Op desktop heeft het geen effect want body.mobile-
  // nav-open is dan toch nooit gezet.
  const closeMobileNav = () => {
    if (typeof document !== "undefined") {
      document.body.classList.remove("mobile-nav-open");
    }
  };

  return (
    <>
      {/* Backdrop achter de sidebar op mobile. Klik = nav sluiten. */}
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Menu sluiten"
        onClick={closeMobileNav}
      />
      <nav className="sidebar" onClick={(e) => {
        // Klik op een Link → sluit nav. We checken of de target
        // een <a> of binnen een <a> zit; alleen dan sluiten zodat
        // klikken op de workspace-button of dropdown niet de hele
        // nav dichtklapt.
        const target = e.target as HTMLElement;
        if (target.closest("a")) closeMobileNav();
      }}>
      {/* Workspace-blok bovenin, klikbaar, opent account-dropdown. */}
      <div className="sb-workspace-wrap" ref={menuRef}>
        <button
          type="button"
          className={`sb-workspace ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Account-menu"
        >
          <div className="sb-avatar">
            {active ? getInitials(active.name) : "—"}
          </div>
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
            {/* Restaurant-switcher, alleen tonen als de user toegang
                heeft tot meer dan één restaurant, anders is dit stukje
                visuele ruis zonder doel. */}
            {restaurants.length > 1 && (
              <>
                <div className="sb-menu-label">Wissel restaurant</div>
                {restaurants.map((r) => {
                  const isActive = r.id === active?.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="sb-menu-item sb-menu-restaurant"
                      role="menuitem"
                      onClick={() => handleSwitchRestaurant(r.id)}
                      aria-current={isActive}
                    >
                      <span className="sb-menu-mini-avatar">
                        {getInitials(r.name)}
                      </span>
                      <span className="sb-menu-restaurant-text">
                        <span className="sb-menu-restaurant-name">
                          {r.name}
                        </span>
                        <span className="sb-menu-restaurant-role">
                          {roleLabel(r.role)}
                        </span>
                      </span>
                      {isActive && (
                        <span className="sb-menu-check" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* "+ Nieuwe zaak", altijd zichtbaar (ook bij 1 restaurant),
                zodat de toevoeg-actie ontdekbaar is zonder eerst naar
                de account-pagina te hoeven. Hergebruikt de bestaande
                onboarding-wizard met ?mode=add (sinds 2026-05-01). Na
                succes wordt de eigenaar automatisch in de nieuwe zaak
                geplaatst. */}
            <Link
              href="/onboarding?mode=add"
              className="sb-menu-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              <span className="sb-menu-icon">+</span>
              Nieuwe onderneming toevoegen
            </Link>
            <div className="sb-menu-divider" aria-hidden />

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
            <span className="sb-icon" aria-hidden>{item.icon}</span>
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
    </>
  );
}
