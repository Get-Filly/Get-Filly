import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing, type Locale } from "./i18n/routing";

// NB: de demo basic-auth-popup (DEMO_AUTH_USERNAME/PASSWORD) is per
// 2026-05-29 verwijderd. Reden: voor de Google Business Profile OAuth-
// verificatie moeten Google's reviewers de publieke pagina's
// (privacy, voorwaarden) én de OAuth-flow kunnen bereiken zonder
// basic-auth-blokkade. Het dashboard blijft beschermd via de
// Supabase-auth-gates hieronder; alleen de extra demo-laag is weg.
// De DEMO_AUTH_*-env-vars in Vercel kunnen verwijderd worden (ongebruikt).
//
// I18N (2026-06-19): deze middleware doet nu TWEE dingen, in volgorde:
//   1. next-intl-routing: bepaalt de locale uit de URL (/en → en, anders nl)
//      en zet de NEXT_LOCALE-cookie. Met localePrefix "as-needed" houdt de
//      NL-default kale URLs (geen /nl-prefix), dus alle bestaande URLs +
//      externe callbacks blijven gelijk.
//   2. De bestaande Supabase-auth-gates, maar nu op het pad ZONDER
//      locale-prefix (zodat /en/dashboard net zo wordt afgehandeld als
//      /dashboard).
// Route handlers /auth/* en /oauth/* vallen buiten de matcher (zie onder):
// dat zijn machine-endpoints op vaste URLs, geen gelokaliseerde pagina's.

const handleI18nRouting = createIntlMiddleware(routing);

// Haal de actieve locale uit het pad en geef het pad terug zónder prefix.
// Alleen niet-default-locales hebben een prefix (as-needed), dus we checken
// alleen op /en (en eventuele toekomstige talen).
function splitLocale(path: string): { locale: Locale; pathname: string } {
  for (const loc of routing.locales) {
    if (loc === routing.defaultLocale) continue;
    if (path === `/${loc}` || path.startsWith(`/${loc}/`)) {
      return { locale: loc, pathname: path.slice(loc.length + 1) || "/" };
    }
  }
  return { locale: routing.defaultLocale, pathname: path };
}

// Bouw een pad mét de juiste locale-prefix (default = geen prefix).
function withLocale(pathname: string, locale: Locale): string {
  if (locale === routing.defaultLocale) return pathname;
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}

export async function middleware(request: NextRequest) {
  // Stap 1: next-intl bepaalt locale + zet de NEXT_LOCALE-cookie. We bouwen
  // alle verdere cookies (Supabase-sessie) op DEZE response, zodat de
  // locale-cookie + sessie samen meegaan.
  const response = handleI18nRouting(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Stap 2: auth-gates op het pad ZONDER locale-prefix. Redirects krijgen de
  // locale weer terug via withLocale(), zodat een /en-bezoeker op /en blijft.
  const { locale, pathname } = splitLocale(request.nextUrl.pathname);

  // Helper: redirect naar een (gelokaliseerd) pad, met behoud van de cookies
  // die stap 1 + Supabase al op `response` hebben gezet.
  const redirectTo = (targetPathname: string, search?: URLSearchParams) => {
    const url = request.nextUrl.clone();
    url.pathname = withLocale(targetPathname, locale);
    url.search = search ? `?${search.toString()}` : "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  // Alleen /login is nog een echte auth-pagina (/signup redirect naar /contact).
  const isAuthPage = pathname === "/login";
  const isDashboard = pathname.startsWith("/dashboard");
  const isOnboarding = pathname.startsWith("/onboarding");

  // Niet-ingelogde bezoeker op dashboard of onboarding → terug naar login.
  if ((isDashboard || isOnboarding) && !user) {
    const params = new URLSearchParams();
    params.set("next", pathname);
    return redirectTo("/login", params);
  }

  // Ingelogde user op auth-pagina → door naar dashboard.
  if (isAuthPage && user) {
    return redirectTo("/dashboard");
  }

  // Onboarding-gate: een ingelogde user kan in 3 staten zijn:
  //   A. Nog geen restaurant → moet naar /onboarding
  //   B. Wel een restaurant + bezoekt /onboarding zonder ?mode=add
  //      → terug naar dashboard (per ongeluk daar beland)
  //   C. Wel een restaurant + bezoekt /onboarding?mode=add
  //      → laat door (eigenaar wil 2e/3e zaak toevoegen, sinds 2026-05-01)
  // We checken dat door te vragen of er een restaurant_users-rij is
  // voor deze user. Dankzij RLS (user_id = auth.uid()) hoeven we geen
  // service_role te gebruiken: de user mag z'n eigen koppeling zien.
  if (user && (isDashboard || isOnboarding)) {
    const { data: membership } = await supabase
      .from("restaurant_users")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const hasRestaurant = !!membership;
    // Bewust opt-in via expliciete query-flag: voorkomt dat een
    // gebookmarkte /onboarding-URL of een rondhangende tab bestaande
    // gebruikers ineens weer in de wizard zet. De flag wordt door de
    // "+ Nieuw restaurant"-knoppen meegestuurd (account-pagina +
    // workspace-dropdown).
    const wantsAdd = request.nextUrl.searchParams.get("mode") === "add";

    if (isDashboard && !hasRestaurant) {
      return redirectTo("/onboarding");
    }
    if (isOnboarding && hasRestaurant && !wantsAdd) {
      return redirectTo("/dashboard");
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Pas toe op alle paden behalve:
    //  - _next (build-assets), _vercel (analytics)
    //  - /auth/* en /oauth/* (machine-route-handlers op vaste URLs; mogen
    //    niet door i18n-routing gerewrite worden)
    //  - /media/* (publieke media-route-handlers, bv. /media/c/:id voor de
    //    TikTok-video; niet gelokaliseerd)
    //  - alles met een punt erin (robots.txt, sitemap.xml, *.png, …)
    "/((?!_next|_vercel|auth|oauth|media|.*\\..*).*)",
  ],
};
