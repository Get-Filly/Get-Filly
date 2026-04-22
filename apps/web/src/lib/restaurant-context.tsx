"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * ============================================================
 * RestaurantContext — actief restaurant + rol + permissies
 * ============================================================
 *
 * Wat is een "Context" in React?
 *   Een manier om data beschikbaar te maken voor alle components
 *   in een boom, zonder die data overal als prop mee te geven.
 *
 * Wat houden we hier bij:
 *   - Lijst van restaurants waar de ingelogde user toegang toe heeft
 *   - Welk restaurant NU actief is (dit geeft de backend als
 *     X-Restaurant-Id mee)
 *   - Rol + permissies binnen dat restaurant (voor het filteren van
 *     menu-items etc.)
 *   - Helper om van restaurant te wisselen
 *
 * Waar wordt deze context geladen?
 *   In het dashboard-layout — zodra je op /dashboard/* bent, zit je
 *   onder deze provider. Op de publieke site hebben we dit niet
 *   nodig.
 *
 * Hoe blijft de keuze "onthouden"?
 *   We slaan de actieve restaurant-ID op in localStorage zodat een
 *   refresh hem behoudt. Op een ander apparaat kiest de user opnieuw
 *   (standaard het eerste restaurant).
 */

export type RestaurantSummary = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  permissions: string[];
};

type RestaurantContextValue = {
  /** Alle restaurants waar de user toegang toe heeft. */
  restaurants: RestaurantSummary[];
  /** Het actieve restaurant (null tijdens laden of bij 0 restaurants). */
  active: RestaurantSummary | null;
  /** Wisselen naar een ander restaurant (bewaart keuze in localStorage). */
  setActive: (id: string) => void;
  /** Ingevuld tijdens de initiële fetch naar /me/restaurants. */
  loading: boolean;
  /** Error bij laden — null als alles goed ging. */
  error: string | null;
};

/**
 * Default-waarde voor de context. Deze zie je alleen als een
 * component buiten de Provider wordt gebruikt — dan is er geen
 * echte data, maar ook geen crash.
 */
const RestaurantContext = createContext<RestaurantContextValue>({
  restaurants: [],
  active: null,
  setActive: () => undefined,
  loading: true,
  error: null,
});

const STORAGE_KEY = "getfilly.activeRestaurantId";
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Leest het opgeslagen actieve restaurant-id uit localStorage.
 * Geeft null terug als er niks is of als we server-side draaien
 * (waar window niet bestaat).
 */
function readStoredActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredActiveId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage kan falen in privé-modus — negeer stil.
  }
}

/**
 * Provider-component — zet deze om de dashboard-layout heen.
 * Laadt bij mount de lijst van restaurants via /me/restaurants.
 */
export function RestaurantProvider({
  children,
  jwt,
}: {
  children: ReactNode;
  /**
   * We accepteren een functie die een JWT ophaalt i.p.v. direct
   * supabase te importeren. Dit voorkomt een circulaire import-
   * keten tussen api.ts en deze file, en maakt testen makkelijker.
   */
  jwt: () => Promise<string | null>;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Laad /me/restaurants één keer bij mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await jwt();
        if (!token) {
          // Geen sessie — de middleware stuurt de user sowieso weg van
          // /dashboard/*, maar we zetten loading af zodat er geen
          // oneindig spinner blijft draaien.
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_URL}/me/restaurants`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const list = (await res.json()) as RestaurantSummary[];
        if (cancelled) return;

        setRestaurants(list);

        // Kies actief restaurant: opgeslagen keuze als die nog geldig is,
        // anders het eerste restaurant in de lijst.
        const stored = readStoredActiveId();
        const validStored =
          stored && list.some((r) => r.id === stored) ? stored : null;
        const initialActive = validStored ?? list[0]?.id ?? null;
        setActiveId(initialActive);
        if (initialActive) writeStoredActiveId(initialActive);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  // Functie om handmatig van restaurant te wisselen. Slaat op én
  // update state.
  const setActive = useCallback((id: string) => {
    setActiveId(id);
    writeStoredActiveId(id);
  }, []);

  // Afgeleide waarde: het volledige record van het actieve restaurant.
  const active = useMemo(
    () => restaurants.find((r) => r.id === activeId) ?? null,
    [restaurants, activeId],
  );

  // useMemo voorkomt dat de context-value bij elke render een nieuw
  // object is (anders zouden consumers onnodig re-renderen).
  const value = useMemo<RestaurantContextValue>(
    () => ({ restaurants, active, setActive, loading, error }),
    [restaurants, active, setActive, loading, error],
  );

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

/**
 * Hook om de context te lezen in welke component dan ook.
 * Gebruik:
 *   const { active, restaurants, setActive } = useRestaurant();
 */
export function useRestaurant(): RestaurantContextValue {
  return useContext(RestaurantContext);
}

/**
 * Kleine helper om het actieve restaurant-id synchroon te lezen —
 * bedoeld voor authedFetch in api.ts. We lezen direct uit localStorage
 * omdat die functie buiten React-componenten draait (geen hooks).
 *
 * Als er niks in localStorage staat geven we null terug; de backend
 * geeft dan 400 met een duidelijke foutmelding en de frontend
 * toont dat als error-UI.
 */
export function getActiveRestaurantIdSync(): string | null {
  return readStoredActiveId();
}
