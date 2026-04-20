"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "Over ons" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <div className="navbar-wrapper">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          Get-Filly
        </Link>
        <div className="nav-links">
          {links.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <Link href="/login" className="nav-login">
          Log in
        </Link>
      </nav>
    </div>
  );
}
