import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Server-side per-request config: bepaalt de actieve locale en laadt het
// bijbehorende berichtenbestand. Wordt aangeroepen door de next-intl-plugin
// (zie next.config.ts) bij elke render.
export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale komt uit het [locale]-segment. Valideer 'm tegen onze
  // toegestane talen; val anders terug op de default (nl).
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
