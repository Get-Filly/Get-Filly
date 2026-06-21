// ============================================================
// Status verwijderverzoek, /data-deletion-status
// ============================================================
// De pagina waarnaar de data-deletion-callback verwijst (de `url` in
// het antwoord aan Meta, met ?id=<confirmation_code>). Hier kan de
// gebruiker bevestigd zien dat z'n verzoek is verwerkt.
//
// Bewust eenvoudig/stateless: de verwijdering gebeurt synchroon in de
// callback, dus de status is altijd "verwerkt". (Een tracking-tabel
// per verzoek kan later, als we async/uitgestelde verwijdering doen.)

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { COMPANY } from "@/config/company";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leg_data_deletion_status_page");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/data-deletion-status" },
    // Geen zoekindex: persoonlijke statuspagina met een verzoekcode.
    robots: { index: false, follow: false },
  };
}

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  // Next 15+: searchParams is een Promise in server-componenten.
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const t = await getTranslations("leg_data_deletion_status_page");

  return (
    <section className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">{t("title")}</h1>

        {id ? (
          <>
            <p className="legal-lead">
              {t("processedLead", { tradeName: COMPANY.tradeName ?? "" })}
            </p>
            <p>
              {t("referenceCode")} <strong>{id}</strong>
            </p>
          </>
        ) : (
          <p className="legal-lead">{t("noCodeLead")}</p>
        )}

        <p>
          {t.rich("contact", {
            email: () => (
              <a href={`mailto:${COMPANY.privacyEmail}`}>
                {COMPANY.privacyEmail}
              </a>
            ),
            deleteLink: (chunks) => <a href="/delete-data">{chunks}</a>,
            privacyLink: (chunks) => <a href="/privacy">{chunks}</a>,
          })}
        </p>
      </div>
    </section>
  );
}
