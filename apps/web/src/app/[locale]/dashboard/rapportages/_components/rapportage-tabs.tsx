"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// ============================================================
// Tabs tussen de twee rapportages
// ============================================================
//
// Rapportages beantwoordt "wat leverden mijn uitingen op" (bereik, kliks,
// per kanaal); Bezetting beantwoordt "hoe vol zat ik". Dat zijn twee
// verschillende vragen en daarom twee pagina's.
//
// Tot 2026-09-16 hing de tweede aan één secundaire knop rechtsboven, en
// stond 'ie nergens in de zijbalk. Gevolg: zelfs wie de app bouwde kon 'm
// niet vinden. Twee tabs lossen dat op zonder de scheiding op te geven.
//
// Bewust <Link> en niet de bestaande <Tabs>: die is voor filters binnen
// één pagina (onChange), dit is navigatie tussen routes. De opmaak is
// dezelfde .tabs/.tab-btn zodat het één patroon blijft.
//
// Link en usePathname komen uit @/i18n/navigation, niet uit next/link:
// die houden de actieve taal vast. usePathname geeft daar het pad zónder
// locale-prefix terug, dus vergelijken kan rechtstreeks.

const TABS = [
  { href: "/dashboard/rapportages", key: "tabResult" },
  { href: "/dashboard/rapportages/bezetting", key: "tabOccupancy" },
] as const;

export function RapportageTabs() {
  const t = useTranslations("dash_rapportages_page");
  const pathname = usePathname();

  // Exact vergelijken, niet met startsWith: anders is de eerste tab ook
  // actief als je op de tweede staat.

  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`tab-btn ${pathname === tab.href ? "active" : ""}`}
        >
          {t(tab.key)}
        </Link>
      ))}
    </div>
  );
}
