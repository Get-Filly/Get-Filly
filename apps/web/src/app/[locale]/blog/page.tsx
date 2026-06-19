// ============================================================
// /blog — kennishub-index (uitgelicht artikel + kernpunten + recent)
// ============================================================
// Server-component: leest de gepubliceerde posts (content/blog/*.md) en
// geeft ze door aan <BlogIndex>. De layout zelf (uitgelicht groen blok,
// 6 crème-kernpunten, "meest recent"-strip + klikgedrag) staat in de
// client-component blog-index.tsx.
//
// Zolang er nog geen posts zijn tonen de kaarten "binnenkort online" en
// houden we de pagina uit de zoekindex (noindex) — een dunne placeholder-
// pagina hoort niet in Google. Zodra er content staat verschijnt 'ie
// automatisch in de index + sitemap (zie sitemap.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { pageMetadata } from "@/config/seo";
import { BlogIndex } from "./blog-index";

export async function generateMetadata(): Promise<Metadata> {
  const posts = await getAllPosts();
  const base = pageMetadata({
    title: "De marketing cocktail",
    description:
      "Inzichten over AI-marketing, online vindbaarheid en meer bezetting voor de horeca, van Get-Filly.",
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
    <>
      <BlogIndex posts={posts} />

      {/* Groene afsluit-CTA in dezelfde .cta-section-stijl als de rest van
          de site, maar met een eigen, unieke tekst (niet hergebruikt van een
          andere pagina) + een doorlink-regel zoals home/product/pricing. De
          footer (Get-Filly + onderwerpen) volgt automatisch via layout.tsx. */}
      <section className="cta-section">
        <h2 className="section-title">Van lezen naar volle tafels.</h2>
        <p className="section-subtitle">
          Je kent nu de theorie. Laat Filly je vindbaarheid, reviews en posts
          regelen, zodat jij je op je gasten kunt richten.
        </p>
        <Link href="/contact" className="cta-btn">
          Plan een gratis kennismaking in
        </Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          Nieuwsgierig hoe Filly dit doet? Bekijk{" "}
          <Link
            href="/product"
            style={{ color: "#FFFFFF", textDecoration: "underline" }}
          >
            het product
          </Link>
          .
        </p>
      </section>
    </>
  );
}
