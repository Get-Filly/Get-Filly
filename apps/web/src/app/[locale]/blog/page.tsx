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
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAllPosts } from "@/lib/blog";
import { pageMetadata } from "@/config/seo";
import { BlogIndex } from "./blog-index";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const posts = await getAllPosts();
  const base = pageMetadata({
    title: t("blog.title"),
    description: t("blog.description"),
    path: "/blog",
    locale,
  });
  // Geen artikelen → uit de index houden tot er content is.
  if (posts.length === 0) {
    return { ...base, robots: { index: false, follow: false } };
  }
  return base;
}

export default async function BlogIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const posts = await getAllPosts();
  const t = await getTranslations("blog.cta");
  return (
    <>
      <BlogIndex posts={posts} />

      {/* Groene afsluit-CTA in dezelfde .cta-section-stijl als de rest van
          de site. De footer volgt automatisch via layout.tsx. */}
      <section className="cta-section">
        <h2 className="section-title">{t("title")}</h2>
        <p className="section-subtitle">{t("subtitle")}</p>
        <Link href="/contact" className="cta-btn">
          {t("button")}
        </Link>
        <p className="section-subtitle" style={{ marginTop: 32, fontSize: 15 }}>
          {t.rich("productLink", {
            link: (chunks) => (
              <Link
                href="/product"
                style={{ color: "#FFFFFF", textDecoration: "underline" }}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </>
  );
}
