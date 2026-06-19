import { defineRouting } from "next-intl/routing";

// Centrale i18n-routing-config. Eén bron van waarheid voor welke talen
// we ondersteunen en hoe ze in de URL verschijnen.
//
//   localePrefix: "as-needed"
//     → Nederlands (de default) blijft op de KALE URL: /pricing, /dashboard,
//       /auth/confirm. Geen /nl-prefix. Dit houdt alle bestaande,
//       geïndexeerde URLs + externe callbacks (Supabase-mail, OAuth) intact.
//     → Engels krijgt wél een prefix: /en/pricing, /en/dashboard.
export const routing = defineRouting({
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
