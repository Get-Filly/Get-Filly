// ============================================================
// /account-verwijderd, bevestigingspagina na AVG-delete
// ============================================================
// Landingspagina nadat een gebruiker via de account-pagina zijn
// account permanent heeft laten verwijderen. Bewust publiek (geen
// auth-gate) want na de delete is de gebruiker uitgelogd én bestaat
// het auth-account niet meer, dashboard is onbereikbaar.
//
// Doel:
//   1. Bevestigen dat de actie is uitgevoerd
//   2. Transparant zijn over wat is gewist en wat (geanonimiseerd)
//      bewaard blijft, zodat de gebruiker weet dat we AVG-conform
//      handelen (Recital 26 voor de leerschat, art. 17 voor de PII)
//   3. Vriendelijk afscheid + uitnodiging om later terug te komen
// ============================================================

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/button-link";
import { COMPANY } from "@/config/company";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leg_account_verwijderd_page");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // Bevestigingspagina na verwijdering: niet relevant voor de zoekindex.
    robots: { index: false, follow: false },
  };
}

export default function AccountVerwijderdPage() {
  const t = useTranslations("leg_account_verwijderd_page");
  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">{t("title")}</h1>
        <p className="legal-lead">{t("lead")}</p>

        <div className="legal-section">
          <h2>{t("erasedHeading")}</h2>
          <ul>
            <li>{t("erasedProfile")}</li>
            <li>{t("erasedData")}</li>
            <li>{t("erasedCampaigns")}</li>
            <li>{t("erasedAccount")}</li>
            <li>{t("erasedPhotos")}</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>{t("retainedHeading")}</h2>
          <p>
            {t.rich("retainedIntro", {
              em: (chunks) => <em>{chunks}</em>,
            })}
          </p>
          <ul>
            <li>{t("retainedNoPii")}</li>
            <li>{t("retainedContext")}</li>
            <li>{t("retainedCampaignMeta")}</li>
            <li>{t("retainedNoFreeText")}</li>
          </ul>
          <p>{t("retainedAuditLog")}</p>
        </div>

        <div className="legal-section">
          <h2>{t("questionsHeading")}</h2>
          <p>
            {t.rich("questionsMail", {
              mail: (chunks) => (
                <a href={`mailto:${COMPANY.privacyEmail}`}>{chunks}</a>
              ),
              email: COMPANY.privacyEmail ?? "",
            })}
          </p>
          <p>
            {t.rich("comeBack", {
              signup: (chunks) => <Link href="/signup">{chunks}</Link>,
            })}
          </p>
        </div>

        <div
          className="legal-section"
          style={{ display: "flex", gap: 12, marginTop: 32 }}
        >
          <ButtonLink href="/">{t("backHome")}</ButtonLink>
        </div>
      </div>
    </section>
  );
}
