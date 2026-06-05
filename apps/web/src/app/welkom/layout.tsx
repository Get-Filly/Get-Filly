// =============================================================================
// Layout voor /welkom, enkel om metadata te leveren.
// =============================================================================
// /welkom is de besloten activatiestap voor een uitgenodigde klant (invite-
// only, met token in de URL). Die hoort NIET in de zoekindex — vandaar
// noindex. page.tsx is een client component en kan zelf geen metadata
// exporteren, dus dat doet deze dunne server-layout.
// =============================================================================

import { pageMetadata } from "@/config/seo";

export const metadata = pageMetadata({
  title: "Welkom bij Get-Filly",
  description: "Activeer je Get-Filly-account.",
  path: "/welkom",
  noindex: true,
});

export default function WelkomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
