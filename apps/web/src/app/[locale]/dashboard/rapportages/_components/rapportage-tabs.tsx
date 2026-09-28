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

// ============================================================
// DE SCHAKELAAR
// ============================================================
// Zet op `true` en de Bezetting-tab staat er weer. Uit gezet op 2026-09-16
// (besluit Floris): we tonen voorlopig alleen Resultaat.
//
// Wat er NIET mee uit gaat, en dat is met opzet:
//   - de route /dashboard/rapportages/bezetting blijft werken, dus je kunt
//     de pagina altijd bekijken door het adres in te typen;
//   - de backend blijft gewoon draaien: de uurlijkse live-metingen, het
//     maandoverzicht vóór de prune (mig 0075) en de meting van wat een
//     campagne met de drukte doet. Er gaat dus geen dag historie verloren
//     terwijl de tab uit staat — dat is precies waarom we die tabel
//     hebben gebouwd.
//
// Eén tab tonen is geen tabs, dus bij `false` verdwijnt de hele balk.
export const TOON_BEZETTING = false;

const TABS = [
  { href: "/dashboard/rapportages", key: "tabResult" },
  { href: "/dashboard/rapportages/bezetting", key: "tabOccupancy" },
] as const;

export function RapportageTabs() {
  const t = useTranslations("dash_rapportages_page");
  const pathname = usePathname();

  // Met één tab is een tab-balk zinloos; dan tonen we 'm helemaal niet.
  if (!TOON_BEZETTING) return null;

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
