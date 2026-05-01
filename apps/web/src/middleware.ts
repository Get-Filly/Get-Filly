import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
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

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";
  const isDashboard = path.startsWith("/dashboard");
  const isOnboarding = path.startsWith("/onboarding");

  // Niet-ingelogde bezoeker op dashboard of onboarding → terug naar login.
  if ((isDashboard || isOnboarding) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Ingelogde user op auth-pagina → door naar dashboard.
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
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
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
    if (isOnboarding && hasRestaurant && !wantsAdd) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Pas toe op alle paden behalve statische assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
