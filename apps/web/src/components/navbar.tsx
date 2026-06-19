"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

// Per 2026-05-13: 'Hoe het werkt' vervangen door 'Home' (verwijst
// naar /, dus de bovenkant van de homepage waar de hero staat). Het
// logo linksboven blijft óók een Home-link maar Floris wil de Home-
// link expliciet in de nav-balk. Verdere volgorde: Oplossing →
// Pricing → Over ons. Route /product blijft (label 'Oplossing').
// De labels komen uit de vertalingen (namespace "nav"); `key` verwijst
// naar de message-key.
const links = [
  { href: "/", key: "home" },
  { href: "/product", key: "solution" },
  { href: "/pricing", key: "pricing" },
  { href: "/about", key: "about" },
  { href: "/blog", key: "blog" },
];

export function Navbar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Hash-tracking: usePathname() ziet de URL-hash niet, dus voor links
  // als '/#hoe-het-werkt' moet je window.location.hash apart uitlezen om
  // de active-state te kunnen bepalen. We re-lezen hem bij elke route-
  // wissel én abonneren op het 'hashchange'-event voor clicks binnen
  // dezelfde pagina (bv. op de homepage zelf op 'Hoe het werkt' klikken).
  const [hash, setHash] = useState<string>("");

  // Mobiel hamburger-menu: open/dicht. Onder de 880px-breakpoint (zie
  // globals.css) verbergt de CSS de horizontale nav en toont in plaats
  // daarvan de hamburger-knop; deze state bepaalt of het uitklap-paneel
  // zichtbaar is.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setHash(window.location.hash);
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  // Sluit het mobiele menu zodra je naar een andere pagina navigeert,
  // anders blijft het paneel open hangen nadat je op een link hebt geklikt.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Publieke navbar niet tonen op dashboard-paden, dat heeft een eigen sidebar.
  if (pathname.startsWith("/dashboard")) return null;

  return (
    // .menu-open op de wrapper triggert in de CSS het uitklappen van het
    // mobiele paneel (zie de @media (max-width: 880px)-regels).
    <div className={`navbar-wrapper ${menuOpen ? "menu-open" : ""}`}>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link
            href="/"
            className="nav-logo"
            aria-label={t("logoAria")}
            onClick={() => setMenuOpen(false)}
          >
            {/* Volledig logo (symbool + tekst) als SVG-vector: scherp op
                elke zoom/retina. Gewone <img> i.p.v. next/image want een
                vector hoeft niet gerasterd te worden. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Get-Filly"
              style={{ height: 44, width: "auto", display: "block" }}
            />
          </Link>

          {/* Wrapper om links + acties. Op desktop staat deze op
              `display: contents` (zie CSS), zodat de bestaande
              space-between-layout van .navbar-inner ongewijzigd blijft.
              Op mobiel wordt dit het verticale uitklap-paneel. */}
          <div className="nav-menu">
            <div className="nav-links">
              {links.map(({ href, key }) => {
                // Active-logica:
                //  - '/' alleen exact op homepage
                //  - hash-links ('/#...') als we op de homepage zijn EN de
                //    huidige hash matcht (anders zou 'Hoe het werkt' altijd
                //    op de homepage actief blijven, ook zonder klik)
                //  - reguliere routes via prefix-match (zodat /product/x ook
                //    'Oplossing' actief houdt)
                const isHashLink = href.startsWith("/#");
                const active =
                  href === "/"
                    ? pathname === "/"
                    : isHashLink
                      ? pathname === "/" && href === `/${hash}`
                      : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`nav-link ${active ? "active" : ""}`}
                    onClick={() => {
                      // Next.js Link voor een hash-link triggert niet altijd
                      // de 'hashchange'-event (history.pushState wijzigt alleen
                      // de URL zonder native event te firen). Daarom updaten we
                      // de hash-state hier direct bij klik. Daarnaast sluiten we
                      // het mobiele menu zodat je na een keuze de pagina ziet.
                      if (isHashLink) setHash(href.replace("/", ""));
                      setMenuOpen(false);
                    }}
                  >
                    {t(key)}
                  </Link>
                );
              })}
            </div>

            <div className="nav-actions">
              <Link
                href="/login"
                className="nav-login"
                onClick={() => setMenuOpen(false)}
              >
                {t("login")}
              </Link>
              <Link
                href="/contact"
                className="nav-demo"
                onClick={() => setMenuOpen(false)}
              >
                {t("demo")}
              </Link>
              <LanguageSwitcher />
            </div>
          </div>

          {/* Hamburger-knop: standaard verborgen (CSS), alleen zichtbaar
              onder 880px. Toggelt het uitklap-paneel. aria-expanded houdt
              screenreaders op de hoogte van de open/dicht-status. */}
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? t("menuClose") : t("menuOpen")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>
    </div>
  );
}
