// =============================================================================
// Layout voor /contact, enkel om metadata te leveren.
// =============================================================================
// page.tsx is een client component ("use client") en kan daarom zélf geen
// `metadata` exporteren (dat mag alleen in server components). Deze dunne
// server-layout zet de SEO-metadata en rendert de pagina ongewijzigd door.
// =============================================================================

import { pageMetadata } from "@/config/seo";

export const metadata = pageMetadata({
  title: "Contact & demo",
  description:
    "Vraag een demo aan of plan een gratis kennismaking met Get-Filly. We laten je graag zien hoe je met AI meer reserveringen uit je bestaande gasten haalt.",
  path: "/contact",
});

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
