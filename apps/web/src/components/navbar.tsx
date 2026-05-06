"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Home-link weggelaten: het logo linksboven is zelf de Home-link.
// Volgorde: eerst "Hoe het werkt" (jumplink naar de drie-strategieën-
// sectie op de homepage) omdat dat uitlegt wat Filly doet, daarna
// Oplossing, Pricing, Over ons, verhaal → functionaliteit → kost → team.
// Route blijft /product om redirects te voorkomen, label is 'Oplossing'.
const links = [
  { href: "/#hoe-het-werkt", label: "Hoe het werkt" },
  { href: "/product", label: "Oplossing" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "Over ons" },
];

export function Navbar() {
  const pathname = usePathname();

  // Hash-tracking: usePathname() ziet de URL-hash niet, dus voor links
  // als '/#hoe-het-werkt' moet je window.location.hash apart uitlezen om
  // de active-state te kunnen bepalen. We re-lezen hem bij elke route-
  // wissel én abonneren op het 'hashchange'-event voor clicks binnen
  // dezelfde pagina (bv. op de homepage zelf op 'Hoe het werkt' klikken).
  const [hash, setHash] = useState<string>("");
  useEffect(() => {
    setHash(window.location.hash);
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  // Publieke navbar niet tonen op dashboard-paden, dat heeft een eigen sidebar.
  if (pathname.startsWith("/dashboard")) return null;

  return (
    <div className="navbar-wrapper">
      <nav className="navbar">
        <div className="navbar-inner">
        <Link href="/" className="nav-logo">
          {/* Tijdelijke SVG-benadering van het logo uit de brandguide:
              onvolledige cirkel (C-vorm, open aan de rechterkant) met
              vier oplopende staven in verschillende groentinten, de
              hoogste komt net door de opening. Later vervangen door de
              definitieve designer-versie. */}
          <svg
            className="nav-logo-mark"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            {/* C-vorm: kleine opening aan de rechterkant (~60°).
                Start rechtsboven (25.5,10.5), loopt tegen de klok in
                helemaal rond naar rechtsonder (25.5,21.5). Daardoor
                lijkt de cirkel veel meer op de letter C uit de brand. */}
            <path
              d="M 25.5 10.5 A 11 11 0 1 0 25.5 21.5"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Vier staven, donker naar licht van links naar rechts.
                Hoogste staaf staat bij de opening van de C zodat hij
                visueel uit de cirkel lijkt te komen. */}
            <rect x="7.5"  y="20" width="2.5" height="7"  rx="0.6" fill="#1F3B2A" />
            <rect x="11.5" y="17" width="2.5" height="10" rx="0.6" fill="#2D5A3F" />
            <rect x="15.5" y="13" width="2.5" height="14" rx="0.6" fill="#5E9570" />
            <rect x="19.5" y="9"  width="2.5" height="18" rx="0.6" fill="#7DA87A" />
          </svg>
          <span>Get-Filly</span>
        </Link>
        <div className="nav-links">
          {links.map(({ href, label }) => {
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
              >
                {label}
              </Link>
            );
          })}
        </div>
        <div className="nav-actions">
          <Link href="/login" className="nav-login">
            Log in
          </Link>
          <Link href="/signup" className="nav-demo">
            Vraag een demo
          </Link>
        </div>
        </div>
      </nav>
    </div>
  );
}
