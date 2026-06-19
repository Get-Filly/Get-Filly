// =============================================================================
// Layout voor /contact, enkel om metadata te leveren.
// =============================================================================
// page.tsx is een client component ("use client") en kan daarom zélf geen
// `metadata` exporteren (dat mag alleen in server components). Deze dunne
// server-layout zet de SEO-metadata en rendert de pagina ongewijzigd door.
// =============================================================================

import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/config/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    title: t("contact.title"),
    description: t("contact.description"),
    path: "/contact",
    locale,
  });
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
