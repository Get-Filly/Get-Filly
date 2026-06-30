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
