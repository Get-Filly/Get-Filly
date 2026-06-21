import { redirect } from "@/i18n/navigation";

// ============================================================
// Legacy-route /dashboard/koppelingen
// ============================================================
// De koppelingen-UI leeft sinds 2026-05-12 in de account-tab
// (/dashboard/account?tab=koppelingen). Deze losse pagina bevatte een
// verouderde, afwijkende kopie van de lijst (o.a. nog "SendGrid" en
// hardgecodeerde statussen) en is nu een simpele redirect, zodat oude
// bookmarks blijven werken zonder een tweede, tegenstrijdige UI.
export default async function KoppelingenRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/dashboard/account?tab=koppelingen", locale });
}
