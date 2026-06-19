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
// content/blog/ zet, verschijnt 'ie in `posts` en wordt de kaart
// automatisch een echte <Link> naar /blog/<slug>.
//
// Zo blijft de pagina nu een nette "binnenkort"-hub en groeit 'ie
// vanzelf mee naarmate je echt schrijft — zonder code aan te passen.

import { useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { PostMeta } from "@/lib/blog";

// Eén geplande/gepubliceerde post in de layout.
type Topic = {
  eyebrow: string;
  title: string;
  slug: string;
  excerpt?: string;
};

// Het uitgelichte artikel bovenaan (groen). Pas titel/slug aan zodra je
// 'm schrijft; de slug koppelt aan content/blog/<slug>.md.
const FEATURED: Topic = {
  eyebrow: "Vindbaarheid",
  title: "7 SEO-tips om meer gasten naar je restaurant te trekken",
  slug: "seo-tips-restaurant",
  excerpt:
    "Zo beheers je je Google Bedrijfsprofiel en zorg je voor consistente vermeldingen, zodat jouw zaak de eerste keuze is in de buurt.",
};

// De 6 kernpunten (2 rijen van 3).
const TOPICS: Topic[] = [
  {
    eyebrow: "Vindbaarheid",
    title: "Waarom online vindbaarheid geen toeval is",
    slug: "vindbaarheid-geen-toeval",
  },
  {
    eyebrow: "Gegevens",
    title: "Consistente gegevens: 18% meer lokale zichtbaarheid",
    slug: "consistente-gegevens",
  },
  {
    eyebrow: "Profiel",
    title: "Een compleet profiel wordt 2,3× vaker gevonden",
    slug: "compleet-profiel",
  },
  {
    eyebrow: "Foto's",
    title: "Foto's: 45% meer routebeschrijvingen",
    slug: "fotos-meer-bezoek",
  },
  {
    eyebrow: "Reviews",
    title: "Recente reviews wegen zwaarder dan het totaal",
    slug: "recente-reviews",
  },
  {
    eyebrow: "Posten",
    title: "Structureel posten: 3 tot 5× per week is de sweet spot",
    slug: "structureel-posten",
  },
];

// Placeholders voor "Meest recent" zolang er nog geen echte posts zijn.
// Zodra content/blog/ posts bevat, tonen we die echte posts hier i.p.v.
// deze placeholders (zie BlogIndex hieronder).
const PLACEHOLDER_RECENT: Topic[] = [
  {
    eyebrow: "Marketing",
    title: "Zo laat je Filly je reviews beantwoorden",
    slug: "filly-reviews",
  },
  {
    eyebrow: "Vindbaarheid",
    title: "Google Bedrijfsprofiel: de complete checklist voor horeca",
    slug: "google-bedrijfsprofiel-checklist",
  },
  {
    eyebrow: "Bezetting",
    title: "Rustige avonden vullen: 5 ideeën die werken",
    slug: "rustige-avonden-vullen",
  },
];

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

// "2026-05-12" → "12 mei 2026". Deterministisch (geen Date/timezone) zodat
// server- en client-render exact gelijk zijn (geen hydration-mismatch).
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, jaar, maand, dag] = m;
  return `${parseInt(dag, 10)} ${MAANDEN[parseInt(maand, 10) - 1]} ${jaar}`;
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
  const [toastVisible, setToastVisible] = useState(false);
  // `ping` telt elke klik; de waarde-verandering laat het effect hieronder
  // de verberg-timer resetten, zodat de toast bij een herhaalde klik opnieuw
  // 2,2s blijft staan.
  const [ping, setPing] = useState(0);

  function showComingSoon() {
    setToastVisible(true);
    setPing((n) => n + 1);
  }

  // Verberg de toast automatisch 2,2s na de laatste klik. De cleanup wist een
  // lopende timer (geen ref nodig → geen ref-toegang tijdens render).
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
      "aria-label": `${label} (binnenkort online)`,
      onClick: showComingSoon,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showComingSoon();
        }
      },
    };
  }

  const featuredPost = published.get(FEATURED.slug);

  // Echte posts hebben voorrang in "Meest recent"; anders placeholders.
  const recent = posts.length > 0 ? posts.slice(0, 3) : null;

  return (
    <section className="blog-hub">
      <div className="blog-wrap">
        <div className="blog-head">
          <h1 className="section-title">De marketing cocktail</h1>
          <p className="section-subtitle" style={{ marginTop: 16 }}>
            Inzichten over online vindbaarheid, AI-marketing en meer bezetting
            voor de horeca.
          </p>
        </div>

        {/* Uitgelicht artikel (groen) */}
        {featuredPost ? (
          <Link href={`/blog/${FEATURED.slug}`} className="blog-feature">
            <FeatureInner post={featuredPost} />
          </Link>
        ) : (
          <div className="blog-feature" {...comingSoonProps(FEATURED.title)}>
            <FeatureInner />
          </div>
        )}

        {/* 6 kernpunten, 2 rijen van 3 */}
        <div className="blog-grid">
          {TOPICS.map((t) => {
            const post = published.get(t.slug);
            const inner = (
              <>
                <div className="blog-eyebrow">{t.eyebrow}</div>
                <div className="blog-card-title">{t.title}</div>
                <div className="blog-card-meta">
                  {post ? (
                    formatDate(post.date)
                  ) : (
                    <>
                      <ClockIcon /> Binnenkort online
                    </>
                  )}
                </div>
              </>
            );
            return post ? (
              <Link key={t.slug} href={`/blog/${t.slug}`} className="blog-card">
                {inner}
              </Link>
            ) : (
              <div key={t.slug} className="blog-card" {...comingSoonProps(t.title)}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* Meest recent */}
        <h2 className="blog-recent-title">Meest recent</h2>
        <div className="blog-recent">
          {recent
            ? recent.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="blog-recent-card"
                >
                  <RecentInner
                    eyebrow="Artikel"
                    title={p.title}
                    meta={formatDate(p.date)}
                  />
                </Link>
              ))
            : PLACEHOLDER_RECENT.map((t) => (
                <div
                  key={t.slug}
                  className="blog-recent-card"
                  {...comingSoonProps(t.title)}
                >
                  <RecentInner eyebrow={t.eyebrow} title={t.title} comingSoon />
                </div>
              ))}
        </div>
      </div>

      <div
        className={`blog-toast${toastVisible ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        Deze post komt binnenkort online
      </div>
    </section>
  );
}

// Inhoud van het uitgelichte groene blok.
function FeatureInner({ post }: { post?: PostMeta }) {
  return (
    <>
      <div className="blog-feature-img">
        <ImageIcon size={36} />
      </div>
      <div className="blog-feature-body">
        <div className="blog-eyebrow">{FEATURED.eyebrow}</div>
        <div className="blog-feature-title">{FEATURED.title}</div>
        <p className="blog-feature-excerpt">{FEATURED.excerpt}</p>
        <div className="blog-feature-meta">
          {post
            ? `Get-Filly · ${formatDate(post.date)}`
            : "Get-Filly · Binnenkort online"}
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
              <ClockIcon /> Binnenkort online
            </>
          ) : (
            meta
          )}
        </div>
      </div>
    </>
  );
}
