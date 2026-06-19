// ============================================================
// /blog/[slug] — een blog-artikel
// ============================================================
// Statisch gegenereerd uit content/blog/<slug>.md. dynamicParams=false:
// alleen vooraf-gegenereerde slugs bestaan (onbekend → 404), dus geen
// filesystem-toegang at runtime op Vercel. Per artikel: SEO-metadata +
// BlogPosting JSON-LD voor zoek- en AI-engines.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { pageMetadata, SITE_URL, SITE_NAME } from "@/config/seo";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${slug}`,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    ...(post.date ? { datePublished: post.date } : {}),
    author: { "@type": "Organization", name: post.author || SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
  };

  return (
    <section className="legal-page">
      <div className="legal-container">
        <script
          type="application/ld+json"
          // Eigen, vertrouwde content → veilig te injecteren.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {post.date && <p className="legal-meta">{post.date}</p>}
        <h1 className="legal-title">{post.title}</h1>
        <div
          className="legal-lead"
          style={{ marginBottom: 24 }}
          // post.html komt uit onze eigen markdown-bestanden (vertrouwd).
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </div>
    </section>
  );
}
