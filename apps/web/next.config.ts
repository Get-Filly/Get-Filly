import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
