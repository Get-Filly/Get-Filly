"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Per 2026-05-13: 'Hoe het werkt' vervangen door 'Home' (verwijst
// naar /, dus de bovenkant van de homepage waar de hero staat). Het
// logo linksboven blijft óók een Home-link maar Floris wil de Home-
// link expliciet in de nav-balk. Verdere volgorde: Oplossing →
// Pricing → Over ons. Route /product blijft (label 'Oplossing').
const links = [
  { href: "/", label: "Home" },
  { href: "/product", label: "Oplossing" },
  { href: "/pricing", label: "Prijzen" },
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
        <Link href="/" className="nav-logo" aria-label="Get-Filly home">
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
                onClick={
                  // Next.js Link voor een hash-link triggert niet altijd de
                  // 'hashchange'-event (history.pushState wijzigt alleen de
                  // URL zonder native event te firen). Daarom updaten we de
                  // hash-state hier direct bij klik, anders zou de active-
                  // state pas bij een page-refresh zichtbaar worden.
                  isHashLink ? () => setHash(href.replace("/", "")) : undefined
                }
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
          <Link href="/contact" className="nav-demo">
            Vraag een demo
          </Link>
        </div>
        </div>
      </nav>
    </div>
  );
}
