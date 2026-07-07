import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl-plugin: koppelt de per-request i18n-config (talen + berichten,
// zie src/i18n/request.ts) aan de build/runtime.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Supabase-project-URL (publieke storage-host) voor de media-rewrite hieronder.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const nextConfig: NextConfig = {
  // next/image: serveer AVIF (kleinst) met WebP-fallback. Default is alleen
  // WebP; AVIF geeft nog eens ~20-30% kleiner voor de marketing-foto's.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    // TikTok Content Posting (PULL_FROM_URL) eist dat de video-URL op het in
    // het TikTok-portal GEVERIFIEERDE domein (get-filly.com) staat. De
    // restaurant-media-bucket is publiek; deze rewrite serveert die bestanden
    // TRANSPARANT onder get-filly.com/media/r/<pad> — geen redirect, dus de
    // host die TikTok ziet blijft get-filly.com (domein-verificatie klopt).
    if (!SUPABASE_URL) return [];
    return [
      {
        source: "/media/r/:path*",
        destination: `${SUPABASE_URL}/storage/v1/object/public/restaurant-media/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        // Apex (get-filly.com) → www (canoniek). Doet twee dingen:
        //  1. SEO: heft de duplicate-content op (apex + www gaven beide
        //     HTTP 200; canonicals/sitemap/JSON-LD wijzen al naar www).
        //  2. OAuth: zorgt dat de redirect_uri altijd op www staat, zodat
        //     we maar één origin (www.get-filly.com) in Meta hoeven te
        //     registreren i.p.v. apex én www.
        // Host-match is exact: subdomeinen (app.get-filly.com) en
        // Vercel-preview-URL's vallen erbuiten → geen redirect-loop met www.
        source: "/:path*",
        has: [{ type: "host", value: "get-filly.com" }],
        destination: "https://www.get-filly.com/:path*",
        permanent: true, // 308 (query-string blijft automatisch behouden)
      },
      {
        // Oude bundle-detail-route (bestond 2026-05-07 t/m 2026-05-13,
        // daarna gemerged in de unified detail-page). Vangt oude
        // bookmarks af; vervangt de client-side redirect-stub die hier
        // tot 2026-06-11 voor in de routes zat.
        source: "/dashboard/campagnes/bundle/:id",
        destination: "/dashboard/campagnes/:id",
        permanent: false, // 307 — bewust niet browser-gecached, route kan ooit terugkomen
      },
    ];
  },
};

export default withNextIntl(nextConfig);
