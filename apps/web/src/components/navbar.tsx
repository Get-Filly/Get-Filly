"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Home-link weggelaten: het logo linksboven is zelf de Home-link,
// zoals owner.com dat ook doet. Scheelt ruis in de nav.
// "Hoe het werkt" jumplinkt naar de sectie op de homepage — past bij
// de Owner-stijl (duidelijk uitleg-item in de hoofdnav).
const links = [
  { href: "/product", label: "Product" },
  { href: "/#hoe-het-werkt", label: "Hoe het werkt" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "Over ons" },
];

export function Navbar() {
  const pathname = usePathname();

  // Publieke navbar niet tonen op dashboard-paden — dat heeft een eigen sidebar.
  if (pathname.startsWith("/dashboard")) return null;

  return (
    <div className="navbar-wrapper">
      <nav className="navbar">
        <div className="navbar-inner">
        <Link href="/" className="nav-logo">
          {/* Tijdelijke SVG-benadering van het logo uit de brandguide:
              onvolledige cirkel (C-vorm, open aan de rechterkant) met
              vier oplopende staven in verschillende groentinten — de
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
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
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
