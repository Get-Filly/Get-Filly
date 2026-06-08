// ============================================================
// /blog — index van blog-/kennisartikelen
// ============================================================
// Leest de posts via de content-laag (content/blog/*.md). Zolang er
// nog geen posts zijn: nette "binnenkort"-staat + noindex (een dunne
// lege pagina hoort niet in de zoekindex). Zodra er posts staan komt
// 'ie automatisch in beeld + in de sitemap (zie sitemap.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { pageMetadata } from "@/config/seo";

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getAllPosts();
  const base = pageMetadata({
    title: "Blog",
    description:
      "Inzichten over AI-marketing, vindbaarheid en meer bezetting voor de horeca — van Get-Filly.",
    path: "/blog",
  });
  // Geen artikelen → uit de index houden tot er content is.
  if (posts.length === 0) {
    return { ...base, robots: { index: false, follow: false } };
  }
  return base;
}

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Blog</h1>

        {posts.length === 0 ? (
          <p className="legal-lead">
            Binnenkort verschijnen hier artikelen over AI-marketing,
            online vindbaarheid en meer bezetting voor de horeca.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li
                key={p.slug}
                style={{
                  padding: "16px 0",
                  borderBottom: "1px solid var(--border, #E5DFD0)",
                }}
              >
                <Link
                  href={`/blog/${p.slug}`}
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--brand, #1F4A2D)",
                    textDecoration: "none",
                  }}
                >
                  {p.title}
                </Link>
                {p.date && (
                  <div style={{ fontSize: 13, color: "var(--tl, #6B6F71)" }}>
                    {p.date}
                  </div>
                )}
                {p.description && (
                  <p style={{ margin: "6px 0 0", fontSize: 15 }}>
                    {p.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
