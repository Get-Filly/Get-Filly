import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CookieBanner } from "@/components/cookie-banner";
import { StructuredData } from "@/components/structured-data";
import { SITE_URL, SITE_NAME } from "@/config/seo";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Site-brede SEO-defaults. Per-pagina metadata (zie config/seo.ts)
// overschrijft title/description/canonical/openGraph waar nodig.
const DEFAULT_TITLE = "Get-Filly — Meer gasten, minder lege stoelen";
const DEFAULT_DESCRIPTION =
  "Get-Filly analyseert je bezettingsdata en zet AI in om automatisch campagnes te draaien die je restaurant voller maken.";

export const metadata: Metadata = {
  // Basis-URL: maakt alle relatieve canonical-/OG-paden absoluut.
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    // Pagina's leveren een korte titel; deze template brandt 'm.
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
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
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className={inter.variable}>
      <body>
        <StructuredData />
        <Navbar />
        {children}
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
