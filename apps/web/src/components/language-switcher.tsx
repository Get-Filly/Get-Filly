"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Taalwisselaar (NL / EN) voor rechtsboven in de navbar (en later de
// dashboard-topbar). Rendert per taal een echte <Link> naar HETZELFDE pad in
// de andere taal — next-intl's Link met de `locale`-prop zet de juiste prefix
// (default nl = geen prefix, en = /en). usePathname() geeft het pad zónder
// locale, zodat we taal kunnen wisselen zonder de pagina te verliezen.
export function LanguageSwitcher() {
  const active = useLocale();
  const pathname = usePathname();
  const t = useTranslations("language");

  return (
    <div className="lang-switch" role="group" aria-label={t("label")}>
      {routing.locales.map((loc) => {
        const isActive = loc === active;
        return (
          <Link
            key={loc}
            href={pathname}
            locale={loc}
            className={`lang-switch-btn ${isActive ? "active" : ""}`}
            aria-current={isActive ? "true" : undefined}
            aria-label={loc === "en" ? t("switchToEn") : t("switchToNl")}
          >
            {loc.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
