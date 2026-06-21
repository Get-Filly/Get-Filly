// ============================================================
// JSON-LD structured data (schema.org)
// ============================================================
// Eén <script type="application/ld+json"> in de root-layout dat
// Google (rich results) én AI-zoekmachines (de "GEO" die we zelf
// verkopen) vertelt wát Get-Filly is. Drie aan elkaar gekoppelde
// nodes via @graph:
//   - Organization     : het bedrijf achter de site (uit company.ts)
//   - WebSite          : de site zelf, verwijst naar de organisatie
//   - SoftwareApplication : het SaaS-product + prijsindicatie
//
// Bron is `config/company.ts` zodat KvK/adres/telefoon op één plek
// staan. JSON.stringify laat `undefined`-velden automatisch weg,
// dus nog-niet-ingevulde gegevens verschijnen simpelweg niet.
// ============================================================

import { COMPANY } from "@/config/company";
import { SITE_URL, SITE_NAME } from "@/config/seo";

export async function StructuredData() {
  // Server component: lees de actieve taal voor inLanguage (nl-NL / en-GB).
  const { getLocale } = await import("next-intl/server");
  const lang = (await getLocale()) === "en" ? "en-GB" : "nl-NL";
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: COMPANY.tradeName,
        legalName: COMPANY.legalName ?? undefined,
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        email: COMPANY.email,
        telephone: COMPANY.phone ?? undefined,
        // KvK als generieke identifier (schema.org kent geen NL-KvK-veld).
        identifier: COMPANY.kvk
          ? {
              "@type": "PropertyValue",
              propertyID: "KvK",
              value: COMPANY.kvk,
            }
          : undefined,
        address:
          COMPANY.addressStreet && COMPANY.addressCity
            ? {
                "@type": "PostalAddress",
                streetAddress: COMPANY.addressStreet,
                postalCode: COMPANY.addressPostcode ?? undefined,
                addressLocality: COMPANY.addressCity,
                addressCountry: "NL",
              }
            : undefined,
        // Social-profielen later toevoegen (Instagram/LinkedIn) voor
        // sterkere entiteitskoppeling.
        sameAs: [],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: lang,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "AI-marketingassistent voor de horeca: analyseert bezetting, stelt campagnes voor en zet ze met jouw goedkeuring live via mail, social en WhatsApp.",
        publisher: { "@id": `${SITE_URL}/#organization` },
        // Prijsindicatie obv de pricing-pagina (Growth €99 / Ultimate €169).
        offers: {
          "@type": "Offer",
          price: "99",
          priceCurrency: "EUR",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Vaste, server-gerenderde data — geen user input, dus veilig.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
