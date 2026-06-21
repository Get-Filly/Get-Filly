// ============================================================
// Get-Filly SEO-helper, centrale per-pagina metadata
// ============================================================
// Next.js 16 bouwt zelf de <head>-tags (title, description, Open
// Graph, Twitter, canonical) uit het Metadata-object dat een
// server-pagina exporteert. Deze helper levert per pagina een
// consistent, compleet object zodat we niet op elke pagina
// dezelfde velden hoeven te herhalen.
//
// LET OP — merge-gedrag van Next: een pagina die `openGraph`
// (her)definieert VERVANGT het volledige openGraph-object van de
// root-layout (ondiepe merge). Daarom vult deze helper openGraph
// telkens compleet in. De OG-deelafbeelding zélf komt NIET van
// hier maar uit `app/opengraph-image.tsx` (file-conventie); die
// heeft hogere prioriteit en propageert site-breed, dus die
// overleeft de merge sowieso.
//
// `metadataBase` staat éénmalig in de root-layout, waardoor de
// relatieve canonical-paden hieronder automatisch absoluut worden.
// ============================================================

import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

// Bouw het pad voor een specifieke taal. Default-locale (nl) = kale URL,
// andere talen krijgen een prefix (/en). Spiegelt localePrefix "as-needed".
export function localizedPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

// hreflang-map (alle talen + x-default) voor een gegeven pad. Voor gebruik
// in alternates.languages, zodat zoek-/AI-engines de taalvarianten kennen.
export function hreflangFor(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedPath(path, l);
  languages["x-default"] = localizedPath(path, routing.defaultLocale);
  return languages;
}

// Canonieke productie-URL. Eén plek aanpassen als het domein wijzigt.
// www is de officiële variant; get-filly.com (apex) hoort hier 301 naartoe
// te redirecten (instellen in Vercel → Project → Domains).
export const SITE_URL = "https://www.get-filly.com";
export const SITE_NAME = "Get-Filly";

// De gegenereerde OG-deelafbeelding (zie app/opengraph-image.tsx, route
// /opengraph-image). We zetten 'm hier EXPLICIET in elke pagina-metadata.
// Reden: zodra een pagina een eigen `openGraph` definieert, vervalt de via
// de file-conventie geërfde afbeelding door de ondiepe merge. Door 'm hier
// mee te geven heeft élke pagina gegarandeerd een deelafbeelding.
const OG_IMAGE = {
  // ?v=N is een cache-buster: social media (WhatsApp/Facebook/LinkedIn)
  // cachet de afbeelding op URL. Bump dit nummer als de OG-afbeelding wijzigt
  // zodat een nieuwe versie wordt opgehaald i.p.v. de gecachte oude.
  url: "/opengraph-image?v=3",
  width: 1200,
  height: 630,
  alt: "Get-Filly",
};

type PageSeo = {
  // Korte paginatitel. Krijgt via de root-template automatisch
  // " · Get-Filly" erachter in de browser-titel.
  title: string;
  description: string;
  // Pad t.o.v. de root, bv. "/product" of "/" (homepage).
  path: string;
  // true = titel exact gebruiken zónder template-suffix (bv. de
  // homepage, die het merk al vooraan in de titel heeft).
  absoluteTitle?: boolean;
  // true = pagina uit de zoekindex houden (bv. besloten flows).
  noindex?: boolean;
  // Actieve taal (nl/en). Bepaalt canonical, hreflang en OG-locale.
  // Default = nl zodat statische aanroepen zonder locale blijven werken.
  locale?: string;
};

// Open Graph-locale-codes per taal.
const OG_LOCALE: Record<string, string> = { nl: "nl_NL", en: "en_US" };

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
  noindex,
  locale,
}: PageSeo): Metadata {
  const loc = locale ?? routing.defaultLocale;
  const localPath = localizedPath(path, loc);
  const url = localPath === "/" ? SITE_URL : `${SITE_URL}${localPath}`;
  // Voor het delen op social tonen we de merk-naam mee, ook als de
  // browser-titel via de template al is gebrand.
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: localPath, languages: hreflangFor(path) },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      locale: OG_LOCALE[loc] ?? "nl_NL",
      siteName: SITE_NAME,
      url,
      title: socialTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
