// ============================================================
// logger — consistente logging voor de web-app
// ============================================================
// Eén plek voor alle logging i.p.v. losse console.*-calls verspreid
// door de code (COO-backlog-item "Logging is inconsistent").
//
// Gedrag:
//   - Server-side (route-handlers zoals /oauth/meta/*): altijd
//     loggen — Vercel pikt console.* op in de function-logs, dus
//     dit is dé manier om productie-incidenten terug te vinden.
//   - Client-side: alleen in development. In productie blijft de
//     browser-console van de eigenaar stil; de catch-blokken tonen
//     zelf al een nette NL-foutmelding in de UI.
//
// Zodra Sentry gekoppeld is (P1-backlog), is dít de plek om
// captureException aan te roepen — alle call-sites liften dan
// gratis mee.

const shouldLog = () =>
  typeof window === "undefined" || process.env.NODE_ENV !== "production";

export const logger = {
  error(...args: unknown[]) {
    if (shouldLog()) console.error(...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog()) console.warn(...args);
  },
};
