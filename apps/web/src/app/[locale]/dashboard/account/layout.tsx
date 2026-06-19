"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRestaurant } from "@/lib/restaurant-context";

/**
 * AccountLayout, sub-navigatie voor Account-instellingen.
 *
 * Boven de pagina-inhoud staat een smalle tab-balk. De Team-tab
 * verschijnt alleen als de ingelogde user de 'team'-module mag zien
 * (dus: alleen de eigenaar). Zo kan een manager of staff hier niet
 * eens aan klikken.
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { active, loading } = useRestaurant();

  // Team-tab alleen tonen als de user de module mag zien.
  const canSeeTeam =
    loading || (active?.permissions.includes("team") ?? false);

  const tabs = [
    { href: "/dashboard/account", label: "Profiel" },
    ...(canSeeTeam
      ? [{ href: "/dashboard/account/team", label: "Team" }]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/dashboard/account"
      ? pathname === "/dashboard/account"
      : pathname.startsWith(href);

  return (
    <div className="account-shell">
      <div className="account-tabs">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`account-tab ${isActive(t.href) ? "active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="account-tab-content">{children}</div>
    </div>
  );
}
