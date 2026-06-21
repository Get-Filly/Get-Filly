// ============================================================
// Gegevens verwijderen, /delete-data
// ============================================================
// Publieke pagina die Meta App Review vereist als "Data Deletion
// Instructions URL": uitleg hoe een gebruiker zijn account/gegevens
// en de Facebook/Instagram-koppeling laat verwijderen.
//
// Verwijst naar de bestaande in-app account-verwijdering
// (Dashboard → Account → "Account permanent verwijderen", die
// `deleteAccount()` aanroept) + het intrekken van de koppeling aan
// Meta-zijde + een handmatig verzoek per e-mail.
//
// Bedrijfsgegevens (contactadres) komen uit `config/company.ts`.
// ============================================================

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/config/company";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leg_delete_data_page");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/delete-data" },
  };
}

const LAST_UPDATED = "6 juni 2026";

export default function DeleteDataPage() {
  const t = useTranslations("leg_delete_data_page");
  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">{t("lastUpdated", { date: LAST_UPDATED })}</p>
        <h1 className="legal-title">{t("title")}</h1>
        <p className="legal-lead">
          {t.rich("lead", {
            tradeName: COMPANY.tradeName ?? "",
            privacyLink: (chunks) => <Link href="/privacy">{chunks}</Link>,
          })}
        </p>

        <h2 id="account">{t("section1Heading")}</h2>
        <p>
          {t.rich("section1Body", {
            strong: (chunks) => <strong>{chunks}</strong>,
            em: (chunks) => <em>{chunks}</em>,
          })}
        </p>

        <h2 id="meta">{t("section2Heading")}</h2>
        <p>{t("section2Intro", { tradeName: COMPANY.tradeName ?? "" })}</p>
        <ul>
          <li>
            {t.rich("section2MetaItem", {
              strong: (chunks) => <strong>{chunks}</strong>,
              tradeName: COMPANY.tradeName ?? "",
            })}
          </li>
          <li>
            {t.rich("section2OwnItem", {
              strong: (chunks) => <strong>{chunks}</strong>,
              tradeName: COMPANY.tradeName ?? "",
            })}
          </li>
        </ul>

        <h2 id="welke-gegevens">{t("section3Heading")}</h2>
        <p>
          {t.rich("section3Body", {
            strong: (chunks) => <strong>{chunks}</strong>,
            privacyLink: (chunks) => <Link href="/privacy">{chunks}</Link>,
          })}
        </p>

        <h2 id="verzoek">{t("section4Heading")}</h2>
        <p>
          {t.rich("section4Body", {
            mailLink: (chunks) => (
              <a href={`mailto:${COMPANY.privacyEmail}`}>{chunks}</a>
            ),
            email: COMPANY.privacyEmail ?? "",
          })}
        </p>
      </div>
    </section>
  );
}
