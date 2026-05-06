"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Footer voor de publieke site. Niet zichtbaar op /dashboard/* en op
// de auth-paden, die hebben hun eigen layout. Zelfde patroon als de
// Navbar, dus de footer verschijnt alleen waar hij hoort.
const HIDDEN_PATHS = ["/dashboard", "/login", "/signup", "/auth", "/invite"];

const linksProduct = [
  { href: "/product", label: "Product" },
  { href: "/#hoe-het-werkt", label: "Hoe het werkt" },
  { href: "/pricing", label: "Pricing" },
];

const linksBedrijf = [
  { href: "/about", label: "Over ons" },
  { href: "mailto:hi@get-filly.com", label: "Contact" },
  { href: "/about#team", label: "Team" },
];

// Juridische links. /privacy en /voorwaarden zijn live (concept-v1,
// nog niet jurist-gereviewd, zie gele banner bovenaan elke pagina).
// /cookies volgt zodra we Plausible o.i.d. inbouwen; tot die tijd
// verwijst de cookies-link naar de cookies-sectie in de privacy-
// verklaring.
const linksJuridisch = [
  { href: "/privacy", label: "Privacybeleid" },
  { href: "/voorwaarden", label: "Voorwaarden" },
  { href: "/privacy#cookies", label: "Cookies" },
];

export function Footer() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-logo">
            {/* Zelfde tijdelijke SVG als in de navbar, consistent tot de
                echte designer-versie er is. */}
            <svg
              className="nav-logo-mark"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path
                d="M 25.5 10.5 A 11 11 0 1 0 25.5 21.5"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <rect x="7.5" y="20" width="2.5" height="7" rx="0.6" fill="#1F3B2A" />
              <rect x="11.5" y="17" width="2.5" height="10" rx="0.6" fill="#2D5A3F" />
              <rect x="15.5" y="13" width="2.5" height="14" rx="0.6" fill="#5E9570" />
              <rect x="19.5" y="9" width="2.5" height="18" rx="0.6" fill="#7DA87A" />
            </svg>
            <span>Get-Filly</span>
          </Link>
          <p className="site-footer-tagline">
            AI-marketingassistent voor ondernemingen met variabele bezetting.
          </p>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">Product</div>
          {linksProduct.map((l) => (
            <Link key={l.label} href={l.href} className="site-footer-link">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">Bedrijf</div>
          {linksBedrijf.map((l) => (
            <Link key={l.label} href={l.href} className="site-footer-link">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">Juridisch</div>
          {linksJuridisch.map((l) => (
            <Link key={l.label} href={l.href} className="site-footer-link">
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {year} Get-Filly. Alle rechten voorbehouden.</span>
        <span>Gebouwd in Nederland · EU-hosting</span>
      </div>
    </footer>
  );
}
