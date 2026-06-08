// ============================================================
// Blog-content-laag — leest markdown-artikelen van schijf
// ============================================================
// Posts leven als `.md`-bestanden in `apps/web/content/blog/` met
// front-matter (title/description/date/author). De bestandsnaam is de
// slug → URL `/blog/<slug>`. Bestanden die met `_` of `.` beginnen
// (zoals `_template.md`) worden genegeerd.
//
// Alles wordt bij de BUILD gelezen (de blog-pagina's zijn statisch),
// dus geen filesystem-toegang at runtime op Vercel.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";

const BLOG_DIR = join(process.cwd(), "content", "blog");

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
};

export type Post = PostMeta & { html: string };

// Minimale front-matter-parser: `--- key: value ... ---` bovenaan,
// daaronder de markdown-body. Geen geneste YAML — voldoende voor blog.
function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };

  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta: Record<string, string> = {};

  for (const line of fmBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body };
}

async function readSlugs(): Promise<string[]> {
  try {
    const files = await readdir(BLOG_DIR);
    return files
      .filter((f) => f.endsWith(".md") && !/^[_.]/.test(f))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    // Map bestaat nog niet of is leeg → geen posts.
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  try {
    const raw = await readFile(join(BLOG_DIR, `${slug}.md`), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const html = await marked.parse(body);
    return {
      slug,
      title: meta.title ?? slug,
      description: meta.description ?? "",
      date: meta.date ?? "",
      author: meta.author ?? "Get-Filly",
      html,
    };
  } catch {
    return null;
  }
}

// Alle gepubliceerde posts, nieuwste eerst (op datum-string, ISO-sorteerbaar).
export async function getAllPosts(): Promise<PostMeta[]> {
  const slugs = await readSlugs();
  const posts = await Promise.all(slugs.map((s) => getPostBySlug(s)));
  return posts
    .filter((p): p is Post => p !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date,
      author: p.author,
    }));
}
