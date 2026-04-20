"use client";

import { usePathname } from "next/navigation";

const titleFor: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/suggesties": "Suggesties",
  "/dashboard/campagnes": "Campagnes",
  "/dashboard/gasten": "Gasten",
  "/dashboard/rapportages": "Rapportages",
  "/dashboard/koppelingen": "Koppelingen",
  "/dashboard/account": "Account",
};

export function Topbar() {
  const pathname = usePathname();
  const title = titleFor[pathname] ?? "Dashboard";

  return (
    <div className="topbar">
      <div className="tb-title">{title}</div>
      <div className="tb-right">
        <span className="tb-badge">Laatste sync: 2 min geleden</span>
        <div className="tb-btn">🔔</div>
        <div className="tb-btn">🔍</div>
      </div>
    </div>
  );
}
