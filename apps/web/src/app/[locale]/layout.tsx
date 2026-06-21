import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import "../globals.css";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CookieBanner } from "@/components/cookie-banner";
import { StructuredData } from "@/components/structured-data";
import { SITE_URL, SITE_NAME, localizedPath, hreflangFor } from "@/config/seo";
// Vercel Web Analytics + Speed Insights: cookieloos en AVG-vriendelijk (geen
// consent-gating nodig). Analytics = bezoekers/pagina's; Speed Insights = de
// echte Core Web Vitals van bezoekers (rankingfactor).
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Site-brede SEO-defaults, nu per taal. Dit is óók de home-metadata (de
// homepage exporteert zelf geen metadata). Per-pagina metadata
// (config/seo.ts → pageMetadata) overschrijft title/description/canonical/OG.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = t("home.title");
  const description = t("home.description");
  const homePath = localizedPath("/", locale);
  const url = homePath === "/" ? SITE_URL : `${SITE_URL}${homePath}`;

  return {
    // Basis-URL: maakt alle relatieve canonical-/OG-paden absoluut.
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      // Pagina's leveren een korte titel; deze template brandt 'm.
      template: `%s · ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    keywords: [
      "horeca marketing",
      "restaurant marketing",
      "AI marketing horeca",
      "meer reserveringen",
      "restaurant bezetting",
      "restaurant campagnes",
      "Get-Filly",
    ],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    // Canonical + hreflang voor de homepage (taalvarianten).
    alternates: { canonical: homePath, languages: hreflangFor("/") },
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "nl_NL",
      siteName: SITE_NAME,
      url,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

// Genereer de statische routes voor elke ondersteunde taal (nl, en).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // Onbekende locale (bv. /fr) → 404 i.p.v. een halve render.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Vereist voor statische rendering: koppelt de locale aan deze render.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        {/* FOUC-fix: zet vóór de eerste paint html.reveal-armed (alleen met JS
            én zonder reduced-motion). Daardoor zijn de scroll-reveal-kaarten
            meteen verborgen i.p.v. heel kort op te flitsen; ScrollReveal toont
            ze daarna bij het scrollen. Zonder JS / reduced-motion komt de class
            nooit → alles gewoon zichtbaar (fallback). Inline + bovenaan body,
            dus het draait vóór de reveal-elementen worden getekend. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('reveal-armed')}}catch(e){}})()",
          }}
        />
        {/* NextIntlClientProvider geeft Client Components toegang tot de
            vertalingen (useTranslations). Locale + berichten komen
            automatisch uit src/i18n/request.ts. */}
        <NextIntlClientProvider>
          <StructuredData />
          <Navbar />
          {children}
          <Footer />
          <CookieBanner />
          <Analytics />
          <SpeedInsights />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
