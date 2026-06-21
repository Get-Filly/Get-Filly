"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type Module } from "@getfilly/shared";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * ============================================================
 * AccessGuard, beschermt dashboard-pagina's tegen ongeoorloofde toegang
 * ============================================================
 *
 * Hoe het werkt:
 *   Op basis van het huidige URL-pad bepaalt deze component welke
 *   "module" vereist is. Als de user die module niet mag zien,
 *   tonen we een nette "Geen toegang"-boodschap ipv de pagina,
 *   én sturen we hem na een korte pauze terug naar het dashboard.
 *
 * Waarom een centrale guard ipv per pagina?
 *   Eén plek onderhoudt de mapping "pad → module". Nieuwe pagina
 *   toevoegen = één regel hier updaten. Geen kans dat een pagina
 *   per ongeluk onbeschermd blijft.
 *
 * Belangrijk:
 *   Dit is de FRONTEND-guard. De échte beveiliging gebeurt op de
 *   backend (AuthGuard + RestaurantAccessGuard). Deze component is
 *   puur voor UX, voorkomen dat iemand een pagina ziet waar hij
 *   toch geen data op kan zien.
 */

/**
 * Mapping van URL-prefix naar vereiste module.
 * Volgorde maakt uit: de meest-specifieke paden eerst.
 */
const PATH_MODULE_MAP: Array<{ prefix: string; module: Module }> = [
  { prefix: "/dashboard/taken", module: "taken" },
  { prefix: "/dashboard/suggesties", module: "suggesties" },
  { prefix: "/dashboard/reserveringen", module: "reserveringen" },
  { prefix: "/dashboard/campagnes", module: "campagnes" },
  { prefix: "/dashboard/gasten", module: "gasten" },
  // /dashboard/google-business (en alle sub-routes /reviews, /audit,
  // /posts, etc.) vallen onder de google_business-module. De oude
  // /dashboard/reviews-route bestaat nog als server-side redirect-
  // stub, maar wordt nooit gerenderd, dus geen guard nodig.
  { prefix: "/dashboard/google-business", module: "google_business" },
  // Marketing-hub + sub-routes (mail/instagram/facebook/tiktok).
  { prefix: "/dashboard/marketing", module: "marketing" },
  { prefix: "/dashboard/menu", module: "menu" },
  { prefix: "/dashboard/rapportages", module: "rapportages" },
  { prefix: "/dashboard/koppelingen", module: "koppelingen" },
  // Team-subpagina vereist eigen module-check (alleen owner).
  // Moet VOOR /dashboard/account staan, anders wordt die eerder
  // gematcht (prefix-match "startsWith").
  { prefix: "/dashboard/account/team", module: "team" },
  { prefix: "/dashboard/account", module: "account" },
  // /dashboard zelf (zonder sub-pad) valt onder 'dashboard'.
  { prefix: "/dashboard", module: "dashboard" },
];

/**
 * Zoek welke module vereist is voor dit pad.
 * Geeft null als we het pad niet kennen (dan geen check).
 */
function requiredModuleFor(pathname: string): Module | null {
  const match = PATH_MODULE_MAP.find((m) => pathname.startsWith(m.prefix));
  return match ? match.module : null;
}

export function AccessGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("dash__components_access_guard");
  const pathname = usePathname();
  const router = useRouter();
  const { active, loading } = useRestaurant();

  // Redirect-logica in een effect zodat we niet tijdens de render
  // navigeren (dat is niet toegestaan in React).
  const requiredModule = requiredModuleFor(pathname);
  const hasAccess =
    !requiredModule ||
    loading ||
    (active?.permissions?.includes(requiredModule) ?? false);

  useEffect(() => {
    if (loading) return;
    if (!active) return;
    if (!requiredModule) return;
    if (!active.permissions.includes(requiredModule)) {
      // Geef de user 1.5 seconde de tijd om de boodschap te lezen,
      // dan terug naar dashboard (waar hij altijd toegang tot heeft).
      const timer = setTimeout(() => {
        router.replace("/dashboard");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [pathname, active, loading, requiredModule, router]);

  // Tijdens laden van context: gewoon de pagina renderen (optimistisch).
  // Als de user uiteindelijk geen toegang blijkt te hebben, komt hij in
  // het blok hierboven en wordt teruggestuurd.
  if (hasAccess) {
    return <>{children}</>;
  }

  // User heeft geen toegang, toon nette boodschap.
  return (
    <div
      style={{
        padding: "48px 32px",
        textAlign: "center",
        color: "var(--text-secondary, #52525B)",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "var(--text, #18181B)" }}>
        {t("noAccessTitle")}
      </h2>
      <p style={{ margin: 0, fontSize: 14 }}>
        {t("noAccessBody")}
      </p>
    </div>
  );
}
