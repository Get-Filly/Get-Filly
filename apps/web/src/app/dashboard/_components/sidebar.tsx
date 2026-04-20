"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { href: "/dashboard", icon: "📊", label: "Dashboard" },
  { href: "/dashboard/suggesties", icon: "💡", label: "Suggesties" },
  { href: "/dashboard/campagnes", icon: "📣", label: "Campagnes" },
  { href: "/dashboard/gasten", icon: "👥", label: "Gasten" },
  { href: "/dashboard/rapportages", icon: "📈", label: "Rapportages" },
];

const settings = [
  { href: "/dashboard/koppelingen", icon: "🔗", label: "Koppelingen" },
  { href: "/dashboard/account", icon: "⚙️", label: "Account" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="sidebar">
      <Link href="/" className="sb-logo">
        Get-Filly
      </Link>

      <div className="sb-section">
        <div className="sb-label">Menu</div>
        {menu.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item ${isActive(item.href) ? "active" : ""}`}
          >
            <span className="sb-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="sb-section">
        <div className="sb-label">Instellingen</div>
        {settings.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item ${isActive(item.href) ? "active" : ""}`}
          >
            <span className="sb-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="sb-bottom">
        <Link href="/" className="sb-site-link">
          ← Bekijk website
        </Link>
        <div className="sb-user">
          <div className="sb-avatar">BH</div>
          <div>
            <div className="sb-uname">Bistro Het Huys</div>
            <div className="sb-urole">Pro plan</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
