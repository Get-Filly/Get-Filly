// =============================================================================
// sitemap.xml, automatisch gegenereerd door Next.js
// =============================================================================
// Next bouwt hiervan /sitemap.xml. Alleen de publieke, indexeerbare pagina's
// staan erin — besloten flows (dashboard, login, onboarding, welkom, auth)
// horen niet in de zoekindex en blijven eruit (zie ook robots.ts).
// Bereikbaar op https://get-filly.com/sitemap.xml.
// =============================================================================

import type { MetadataRoute } from "next";
import { SITE_URL, localizedPath } from "@/config/seo";
import { routing } from "@/i18n/routing";
import { getAllPosts } from "@/lib/blog";

// Pad → absolute URL.
const abs = (p: string) => (p === "/" ? SITE_URL : `${SITE_URL}${p}`);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const routes: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/product", priority: 0.9, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.7, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/voorwaarden", priority: 0.3, changeFrequency: "yearly" },
    {
      path: "/beleid-overheidsverzoeken",
      priority: 0.3,
      changeFrequency: "yearly",
    },
    { path: "/delete-data", priority: 0.3, changeFrequency: "yearly" },
  ];

  // Blog: alleen opnemen zodra er artikelen zijn (de lege /blog is
  // noindex). Index-pagina + één entry per artikel.
  const posts = await getAllPosts();
  if (posts.length > 0) {
    routes.push({ path: "/blog", priority: 0.7, changeFrequency: "weekly" });
    for (const post of posts) {
      routes.push({
        path: `/blog/${post.slug}`,
        priority: 0.6,
        changeFrequency: "monthly",
      });
    }
  }

  // Per pagina één entry per taal, elk met de hreflang-alternates (alle
  // taalvarianten). Default-locale (nl) staat op de kale URL, en op /en.
  return routes.flatMap((r) => {
    const languages: Record<string, string> = {};
    for (const l of routing.locales) languages[l] = abs(localizedPath(r.path, l));
    return routing.locales.map((l) => ({
      url: abs(localizedPath(r.path, l)),
      lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
      alternates: { languages },
    }));
  });
}
