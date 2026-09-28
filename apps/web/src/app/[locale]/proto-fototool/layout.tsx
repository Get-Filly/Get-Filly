import type { Metadata } from "next";

// Klik-prototype: publiek bereikbaar (handig om een UX-voorstel te bekijken
// zonder login), maar het toont mock-data en heeft geen zoekwaarde. Vandaar
// noindex. robots.ts sluit /proto-* daarnaast uit in robots.txt; dit is de
// tweede laag, voor crawlers die de pagina toch via een link bereiken.
//
// Een layout en geen metadata-export in page.tsx: die pagina is een client
// component ("use client") en kan zelf geen metadata exporteren.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ProtoFotoToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
