"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { COMPANY } from "@/config/company";

// Footer voor de publieke site. Niet zichtbaar op /dashboard/* en op
// de auth-paden, die hebben hun eigen layout. Zelfde patroon als de
// Navbar, dus de footer verschijnt alleen waar hij hoort.
// usePathname uit @/i18n/navigation geeft het pad ZONDER locale-prefix,
// zodat startsWith("/dashboard") ook op /en correct werkt.
const HIDDEN_PATHS = ["/dashboard", "/login", "/signup", "/auth", "/invite"];

// Labels komen uit de vertalingen (namespace "footer"); `key` verwijst
// naar de message-key. 'Hoe het werkt' verwijst naar de gelijknamige
// sectie op de homepage (#hoe-het-werkt).
const linksProduct = [
  { href: "/product", key: "solution" },
  { href: "/#hoe-het-werkt", key: "howItWorks" },
  { href: "/pricing", key: "pricing" },
];

const linksBedrijf = [
  { href: "/about", key: "about" },
  { href: "/blog", key: "blog" },
  { href: `mailto:${COMPANY.email}`, key: "contact" },
  { href: "/about#team", key: "team" },
];

// Juridische links. /privacy en /voorwaarden zijn live (concept-v1,
// nog niet jurist-gereviewd, zie gele banner bovenaan elke pagina).
const linksJuridisch = [
  { href: "/privacy", key: "privacy" },
  { href: "/voorwaarden", key: "terms" },
  { href: "/beleid-overheidsverzoeken", key: "governmentRequests" },
  { href: "/privacy#cookies", key: "cookies" },
];

export function Footer() {
  const pathname = usePathname();
  const t = useTranslations("footer");
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link
            href="/"
            className="site-footer-logo"
            aria-label={t("logoAria")}
          >
            {/* Volledig logo (symbool + tekst) als SVG-vector. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Get-Filly"
              style={{ height: 35, width: "auto", display: "block" }}
            />
          </Link>
          {/* Sociale kanalen: extern, openen in nieuw tabblad. */}
          <div className="site-footer-socials">
            <a
              href="https://www.linkedin.com/company/get-filly/about/"
              target="_blank"
              rel="noopener noreferrer"
              className="site-footer-social"
              aria-label="LinkedIn"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/getfilly/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              className="site-footer-social"
              aria-label="Instagram"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">{t("colProduct")}</div>
          {linksProduct.map((l) => (
            <Link key={l.key} href={l.href} className="site-footer-link">
              {t(l.key)}
            </Link>
          ))}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">{t("colCompany")}</div>
          {linksBedrijf.map((l) => (
            <Link key={l.key} href={l.href} className="site-footer-link">
              {t(l.key)}
            </Link>
          ))}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-col-title">{t("colLegal")}</div>
          {linksJuridisch.map((l) => (
            <Link key={l.key} href={l.href} className="site-footer-link">
              {t(l.key)}
            </Link>
          ))}
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>{t("rights", { year })}</span>
        <span>{t("builtIn")}</span>
      </div>
    </footer>
  );
}
