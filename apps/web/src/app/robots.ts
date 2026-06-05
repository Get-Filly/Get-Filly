// =============================================================================
// robots.txt, automatisch gegenereerd door Next.js
// =============================================================================
// Stuurt crawlers: alles mag, behalve de besloten/app-routes (die leveren
// geen zoekwaarde en bevatten soms tokens). Verwijst tevens naar de sitemap.
// Bereikbaar op https://get-filly.com/robots.txt.
// =============================================================================

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/",
        "/login",
        "/signup",
        "/onboarding",
        "/welkom",
        "/forgot-password",
        "/reset-password",
        "/account-verwijderd",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
