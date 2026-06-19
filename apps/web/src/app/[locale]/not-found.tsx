// =============================================================================
// Custom 404, /not-found
// =============================================================================
// Vervangt de kale Next-standaard-404 door een on-brand pagina met heldere
// links terug de site in (beter voor bezoekers én voor crawlers, die zo niet
// in een doodlopende straat belanden). Wordt automatisch binnen de root-
// layout gerenderd, dus navbar + footer zitten er al omheen.
// =============================================================================

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  // not-found rendert binnen [locale]/layout (die setRequestLocale doet),
  // dus getTranslations() pakt de actieve locale uit de request-context.
  const t = await getTranslations("notFound");
  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">{t("title")}</h1>
        <p className="legal-lead">{t("lead")}</p>

        <div className="legal-section">
          <p>{t("linksIntro")}</p>
          <ul>
            <li><Link href="/">{t("home")}</Link></li>
            <li><Link href="/product">{t("solution")}</Link></li>
            <li><Link href="/pricing">{t("pricing")}</Link></li>
            <li><Link href="/about">{t("about")}</Link></li>
            <li><Link href="/contact">{t("contact")}</Link></li>
          </ul>
        </div>

        <div style={{ marginTop: 28 }}>
          <Link href="/" className="btn-primary">{t("backHome")}</Link>
        </div>
      </div>
    </section>
  );
}
