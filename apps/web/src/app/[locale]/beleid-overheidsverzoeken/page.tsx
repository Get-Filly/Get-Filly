// ============================================================
// Beleid overheidsverzoeken, /beleid-overheidsverzoeken
// ============================================================
// Publieke pagina: hoe Get-Filly omgaat met verzoeken van
// overheidsinstanties (politie, justitie, toezichthouders) om
// persoonsgegevens. Aangeleverd als formeel beleid (v1.0). Zelfde
// opbouw als /privacy en /voorwaarden: hardcoded JSX + i18n-messages
// (namespace leg_government_requests), gestyled via de .legal-* classes
// in globals.css. Tekst komt 1-op-1 uit het bron-document; NL + EN.
// ============================================================

import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leg_government_requests");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/beleid-overheidsverzoeken" },
  };
}

const LAST_UPDATED = "30 juni 2026";
const VERSION = "v1.0";

export default function GovernmentRequestsPage() {
  const t = useTranslations("leg_government_requests");

  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">
          {t("lastUpdated", { date: LAST_UPDATED, version: VERSION })}
        </p>
        <h1 className="legal-title">{t("title")}</h1>
        <p className="legal-lead">{t("lead")}</p>

        <nav className="legal-toc" aria-label={t("tocAriaLabel")}>
          <div className="legal-toc-title">{t("tocTitle")}</div>
          <ol>
            <li><a href="#reikwijdte">{t("toc.scope")}</a></li>
            <li><a href="#legaliteit">{t("toc.legality")}</a></li>
            <li><a href="#aanvechten">{t("toc.challenge")}</a></li>
            <li><a href="#minimalisatie">{t("toc.minimization")}</a></li>
            <li><a href="#documentatie">{t("toc.documentation")}</a></li>
            <li><a href="#informeren">{t("toc.notify")}</a></li>
            <li><a href="#verantwoordelijkheid">{t("toc.responsibility")}</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <div id="reikwijdte" className="legal-section">
          <h2>{t("scope.heading")}</h2>
          <p>{t("scope.body")}</p>
        </div>

        {/* 2 */}
        <div id="legaliteit" className="legal-section">
          <h2>{t("legality.heading")}</h2>
          <p>{t("legality.intro")}</p>
          <ul>
            <li>{t("legality.item1")}</li>
            <li>{t("legality.item2")}</li>
            <li>{t("legality.item3")}</li>
          </ul>
          <p>{t("legality.closing")}</p>
        </div>

        {/* 3 */}
        <div id="aanvechten" className="legal-section">
          <h2>{t("challenge.heading")}</h2>
          <p>{t("challenge.body")}</p>
        </div>

        {/* 4 */}
        <div id="minimalisatie" className="legal-section">
          <h2>{t("minimization.heading")}</h2>
          <p>{t("minimization.body")}</p>
        </div>

        {/* 5 */}
        <div id="documentatie" className="legal-section">
          <h2>{t("documentation.heading")}</h2>
          <p>{t("documentation.intro")}</p>
          <ul>
            <li>{t("documentation.item1")}</li>
            <li>{t("documentation.item2")}</li>
            <li>{t("documentation.item3")}</li>
            <li>{t("documentation.item4")}</li>
            <li>{t("documentation.item5")}</li>
          </ul>
          <p>{t("documentation.closing")}</p>
        </div>

        {/* 6 */}
        <div id="informeren" className="legal-section">
          <h2>{t("notify.heading")}</h2>
          <p>{t("notify.body")}</p>
        </div>

        {/* 7 */}
        <div id="verantwoordelijkheid" className="legal-section">
          <h2>{t("responsibility.heading")}</h2>
          <p>{t("responsibility.body")}</p>
        </div>
      </div>
    </section>
  );
}
