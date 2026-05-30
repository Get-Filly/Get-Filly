"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPANY } from "@/config/company";

// Footer voor de publieke site. Niet zichtbaar op /dashboard/* en op
// de auth-paden, die hebben hun eigen layout. Zelfde patroon als de
// Navbar, dus de footer verschijnt alleen waar hij hoort.
const HIDDEN_PATHS = ["/dashboard", "/login", "/signup", "/auth", "/invite"];

// Labels consistent met de navbar: route /product heet 'Oplossing',
// /pricing heet 'Prijzen'. 'Hoe het werkt' verwijst naar de
// gelijknamige sectie op de homepage (#hoe-het-werkt).
const linksProduct = [
  { href: "/product", label: "Oplossing" },
  { href: "/#hoe-het-werkt", label: "Hoe het werkt" },
  { href: "/pricing", label: "Prijzen" },
];

const linksBedrijf = [
  { href: "/about", label: "Over ons" },
  { href: `mailto:${COMPANY.email}`, label: "Contact" },
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
          <Link
            href="/"
            className="site-footer-logo"
            aria-label="Get-Filly home"
          >
            {/* Volledig logo (symbool + tekst) als SVG-vector. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Get-Filly"
              style={{ height: 35, width: "auto", display: "block" }}
            />
          </Link>
          <p className="site-footer-tagline">
            AI-assistent voor ondernemingen met variabele bezetting.
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
