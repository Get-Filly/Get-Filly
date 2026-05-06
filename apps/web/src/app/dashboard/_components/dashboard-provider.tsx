"use client";

import { type ReactNode } from "react";
import { RestaurantProvider } from "../../../lib/restaurant-context";
import { createClient } from "../../../lib/supabase-browser";

/**
 * DashboardProvider, client-wrapper die RestaurantProvider opstart.
 *
 * Waarom een apart component?
 *   De layout zelf is een Server Component. RestaurantProvider is
 *   een Client Component (heeft hooks). Door ze te scheiden blijft
 *   de layout server-renderbaar (snellere initial load) terwijl de
 *   context-logica alleen in de browser draait.
 *
 * Wat doet deze provider:
 *   Geeft een JWT-getter door aan RestaurantProvider. Die getter
 *   haalt bij elke aanroep de actuele Supabase-sessie op, zo heeft
 *   de provider altijd een verse token, ook na reconnect.
 */
export function DashboardProvider({ children }: { children: ReactNode }) {
  // Getter die een verse JWT ophaalt uit de Supabase browser-client.
  // Deze functie wordt pas aangeroepen wanneer RestaurantProvider
  // hem nodig heeft (bij de initiële /me/restaurants fetch).
  const getJwt = async (): Promise<string | null> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  return <RestaurantProvider jwt={getJwt}>{children}</RestaurantProvider>;
}
