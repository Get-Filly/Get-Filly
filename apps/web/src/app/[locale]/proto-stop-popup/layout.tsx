import type { Metadata } from "next";

// Klik-prototype: publiek bereikbaar zodat de popup zonder login te
// beoordelen is, maar zonder zoekwaarde. robots.ts sluit /proto-* al uit
// in robots.txt; dit is de tweede laag voor crawlers die hier via een
// link belanden.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ProtoStopPopupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
