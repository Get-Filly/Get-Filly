"use client";

import { useLocale } from "next-intl";

// ============================================================
// Locale-bewuste datum/getal-formatting
// ============================================================
// Veel dashboard-componenten formatteren datums/getallen met een
// hardgecodeerde "nl-NL"-locale. Daardoor toont een Engels dashboard
// nog Nederlandse datums ("12 mei") en getalscheiding (1.234).
//
// Deze helper levert de juiste BCP47-tag voor de actieve taal, zodat
// toLocaleDateString / toLocaleString / Intl.* meebewegen met NL/EN.
//   nl → "nl-NL"   (12 mei 2026, 1.234)
//   en → "en-GB"   (12 May 2026, 1,234) — Brits Engels: dag-maand-volgorde
//        en Europese conventies passen beter bij een NL-horeca-SaaS dan en-US.
// ============================================================

const TAG: Record<string, string> = {
  nl: "nl-NL",
  en: "en-GB",
};

// Map een locale-code (nl/en) naar de BCP47-tag voor Intl/toLocale*.
// Default nl-NL zodat aanroepen zonder bekende locale veilig blijven.
export function localeTag(locale: string): string {
  return TAG[locale] ?? "nl-NL";
}

// Hook-variant voor client components: geeft de tag van de actieve taal.
export function useLocaleTag(): string {
  return localeTag(useLocale());
}
