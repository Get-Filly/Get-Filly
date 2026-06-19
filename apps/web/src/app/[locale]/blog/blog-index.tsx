"use client";

// ============================================================
// /blog-index — de kennishub-layout (client-component)
// ============================================================
// Toont één groen uitgelicht artikel (de pijler), daaronder 2 rijen
// van 3 crème-blokjes met onze kernpunten, en een "Meest recent"-strip.
//
// Status-logica: een kaart waarvan de `slug` nog NIET als gepubliceerd
// artikel bestaat, is een <div role=button> die de "binnenkort online"-
// toast toont. Zodra je een markdown-artikel met diezelfde slug in
// content/blog/ zet, wordt de kaart automatisch een echte <Link>.
//
// I18N: alle copy komt uit de vertalingen (namespace "blog"); hier
// staan alleen de slugs (koppeling naar content/blog/<slug>.md) + de
// message-keys.

import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PostMeta } from "@/lib/blog";

// Het uitgelichte artikel bovenaan (groen). Copy via blog.featured.*.
const FEATURED_SLUG = "seo-tips-restaurant";

// De 6 kernpunten (slug → message-key onder blog.topics).
const TOPICS: { slug: string; key: string }[] = [
  { slug: "vindbaarheid-geen-toeval", key: "findability" },
  { slug: "consistente-gegevens", key: "data" },
  { slug: "compleet-profiel", key: "profile" },
  { slug: "fotos-meer-bezoek", key: "photos" },
  { slug: "recente-reviews", key: "reviews" },
  { slug: "structureel-posten", key: "posting" },
];

// Placeholders voor "Meest recent" zolang er nog geen echte posts zijn.
const PLACEHOLDER_RECENT: { slug: string; key: string }[] = [
  { slug: "filly-reviews", key: "fillyReviews" },
  { slug: "google-bedrijfsprofiel-checklist", key: "gbpChecklist" },
  { slug: "rustige-avonden-vullen", key: "quietEvenings" },
];

// "2026-05-12" → "12 mei 2026" (of EN-maand). Deterministisch (geen
// Date/timezone) zodat server- en client-render exact gelijk zijn.
function formatDate(iso: string, months: string[]): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, jaar, maand, dag] = m;
  return `${parseInt(dag, 10)} ${months[parseInt(maand, 10) - 1]} ${jaar}`;
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
      <path d="M4 17l4.5-4.5L13 17l3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BlogIndex({ posts }: { posts: PostMeta[] }) {
  const t = useTranslations("blog");
  const months = t.raw("months") as string[];

  const [toastVisible, setToastVisible] = useState(false);
  // `ping` telt elke klik; de waarde-verandering laat het effect de
  // verberg-timer resetten, zodat de toast bij herhaalde klik opnieuw 2,2s blijft.
  const [ping, setPing] = useState(0);

  function showComingSoon() {
    setToastVisible(true);
    setPing((n) => n + 1);
  }

  useEffect(() => {
    if (!toastVisible) return;
    const id = window.setTimeout(() => setToastVisible(false), 2200);
    return () => window.clearTimeout(id);
  }, [toastVisible, ping]);

  const published = new Map(posts.map((p) => [p.slug, p]));

  // Props voor een nog-niet-gepubliceerde kaart: <div role=button> die de
  // toast toont, inclusief toetsenbordsteun (Enter/Spatie).
  function comingSoonProps(label: string) {
    return {
      role: "button",
      tabIndex: 0,
      "aria-label": t("comingSoonAria", { label }),
      onClick: showComingSoon,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showComingSoon();
        }
      },
    };
  }

  const featuredPost = published.get(FEATURED_SLUG);

  // Echte posts hebben voorrang in "Meest recent"; anders placeholders.
  const recent = posts.length > 0 ? posts.slice(0, 3) : null;

  return (
    <section className="blog-hub">
      <div className="blog-wrap">
        <div className="blog-head">
          <h1 className="section-title">{t("hubTitle")}</h1>
          <p className="section-subtitle" style={{ marginTop: 16 }}>
            {t("hubSubtitle")}
          </p>
        </div>

        {/* Uitgelicht artikel (groen) */}
        {featuredPost ? (
          <Link href={`/blog/${FEATURED_SLUG}`} className="blog-feature">
            <FeatureInner post={featuredPost} />
          </Link>
        ) : (
          <div className="blog-feature" {...comingSoonProps(t("featured.title"))}>
            <FeatureInner />
          </div>
        )}

        {/* 6 kernpunten, 2 rijen van 3 */}
        <div className="blog-grid">
          {TOPICS.map((topic) => {
            const post = published.get(topic.slug);
            const title = t(`topics.${topic.key}.title`);
            const inner = (
              <>
                <div className="blog-eyebrow">{t(`topics.${topic.key}.eyebrow`)}</div>
                <div className="blog-card-title">{title}</div>
                <div className="blog-card-meta">
                  {post ? (
                    formatDate(post.date, months)
                  ) : (
                    <>
                      <ClockIcon /> {t("comingSoon")}
                    </>
                  )}
                </div>
              </>
            );
            return post ? (
              <Link key={topic.slug} href={`/blog/${topic.slug}`} className="blog-card">
                {inner}
              </Link>
            ) : (
              <div key={topic.slug} className="blog-card" {...comingSoonProps(title)}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* Meest recent */}
        <h2 className="blog-recent-title">{t("recentTitle")}</h2>
        <div className="blog-recent">
          {recent
            ? recent.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="blog-recent-card"
                >
                  <RecentInner
                    eyebrow={t("recentEyebrow")}
                    title={p.title}
                    meta={formatDate(p.date, months)}
                  />
                </Link>
              ))
            : PLACEHOLDER_RECENT.map((topic) => {
                const title = t(`recentPlaceholders.${topic.key}.title`);
                return (
                  <div
                    key={topic.slug}
                    className="blog-recent-card"
                    {...comingSoonProps(title)}
                  >
                    <RecentInner
                      eyebrow={t(`recentPlaceholders.${topic.key}.eyebrow`)}
                      title={title}
                      comingSoon
                    />
                  </div>
                );
              })}
        </div>
      </div>

      <div
        className={`blog-toast${toastVisible ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {t("toast")}
      </div>
    </section>
  );
}

// Inhoud van het uitgelichte groene blok.
function FeatureInner({ post }: { post?: PostMeta }) {
  const t = useTranslations("blog");
  const months = t.raw("months") as string[];
  return (
    <>
      <div className="blog-feature-img">
        <ImageIcon size={36} />
      </div>
      <div className="blog-feature-body">
        <div className="blog-eyebrow">{t("featured.eyebrow")}</div>
        <div className="blog-feature-title">{t("featured.title")}</div>
        <p className="blog-feature-excerpt">{t("featured.excerpt")}</p>
        <div className="blog-feature-meta">
          {post
            ? `${t("byLine")} · ${formatDate(post.date, months)}`
            : `${t("byLine")} · ${t("comingSoon")}`}
        </div>
      </div>
    </>
  );
}

// Inhoud van een brede "meest recent"-kaart.
function RecentInner({
  eyebrow,
  title,
  meta,
  comingSoon,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  comingSoon?: boolean;
}) {
  const t = useTranslations("blog");
  return (
    <>
      <div className="blog-recent-img">
        <ImageIcon size={26} />
      </div>
      <div className="blog-recent-body">
        <div className="blog-eyebrow">{eyebrow}</div>
        <div className="blog-recent-card-title">{title}</div>
        <div className="blog-recent-meta">
          {comingSoon ? (
            <>
              <ClockIcon /> {t("comingSoon")}
            </>
          ) : (
            meta
          )}
        </div>
      </div>
    </>
  );
}
