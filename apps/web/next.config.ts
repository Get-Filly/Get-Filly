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
    ];
  },
};

export default nextConfig;
