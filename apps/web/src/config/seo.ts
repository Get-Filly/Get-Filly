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
  alt: "Get-Filly — Meer gasten, minder lege stoelen",
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
};

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
  noindex,
}: PageSeo): Metadata {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  // Voor het delen op social tonen we de merk-naam mee, ook als de
  // browser-titel via de template al is gebrand.
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      locale: "nl_NL",
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
