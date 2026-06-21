// ============================================================
// Algemene voorwaarden, /voorwaarden
// ============================================================
// Publieke pagina met de algemene voorwaarden (B2B). De volledige
// tekst is per 2026-05-30 vervangen door de aangeleverde
// conceptversie (afgestemd op SaaS, OAuth-koppelingen, Google/Meta,
// Stripe, bunq en Anthropic/Claude).
//
// Bedrijfsgegevens + aansprakelijkheidslimiet + bevoegde rechtbank
// komen uit `apps/web/src/config/company.ts`.
// ============================================================

import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { COMPANY, formatFullAddress } from "@/config/company";

export const metadata: Metadata = {
  // Korte titel; de root-template brandt 'm tot "… · Get-Filly".
  title: "Algemene voorwaarden",
  description:
    "De algemene voorwaarden voor het gebruik van het Get-Filly-platform.",
  alternates: { canonical: "/voorwaarden" },
};

const LAST_UPDATED = "30 mei 2026";

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "12px 0",
  fontSize: 14,
};
const thtd: React.CSSProperties = {
  border: "1px solid var(--border, #E5DFD0)",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "top",
};

export default function VoorwaardenPage() {
  const t = useTranslations("leg_voorwaarden_page");
  const fullAddress = formatFullAddress();

  return (
    <section className="legal-page">
      <div className="legal-container">
        <p className="legal-meta">{t("lastUpdated", { date: LAST_UPDATED })}</p>
        <h1 className="legal-title">{t("title")}</h1>

        <nav className="legal-toc" aria-label={t("tocAriaLabel")}>
          <div className="legal-toc-title">{t("tocTitle")}</div>
          <ol>
            <li><a href="#definities">{t("toc.definities")}</a></li>
            <li><a href="#toepasselijkheid">{t("toc.toepasselijkheid")}</a></li>
            <li><a href="#totstandkoming">{t("toc.totstandkoming")}</a></li>
            <li><a href="#dienst">{t("toc.dienst")}</a></li>
            <li><a href="#account">{t("toc.account")}</a></li>
            <li><a href="#platformen">{t("toc.platformen")}</a></li>
            <li><a href="#google">{t("toc.google")}</a></li>
            <li><a href="#meta">{t("toc.meta")}</a></li>
            <li><a href="#betaling">{t("toc.betaling")}</a></li>
            <li><a href="#duur">{t("toc.duur")}</a></li>
            <li><a href="#data">{t("toc.data")}</a></li>
            <li><a href="#ip">{t("toc.ip")}</a></li>
            <li><a href="#rangorde">{t("toc.rangorde")}</a></li>
            <li><a href="#aansprakelijkheid">{t("toc.aansprakelijkheid")}</a></li>
            <li><a href="#geheimhouding">{t("toc.geheimhouding")}</a></li>
            <li><a href="#overmacht">{t("toc.overmacht")}</a></li>
            <li><a href="#wijzigingen">{t("toc.wijzigingen")}</a></li>
            <li><a href="#recht">{t("toc.recht")}</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <div id="definities" className="legal-section">
          <h2>{t("s1.heading")}</h2>
          <p>{t("s1.intro")}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thtd}>{t("s1.colTerm")}</th>
                <th style={thtd}>{t("s1.colMeaning")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd}>{t("s1.termGetFilly")}</td>
                <td style={thtd}>
                  {t("s1.defGetFillyPre", {
                    legalName: COMPANY.legalName ?? "",
                    kvk: COMPANY.kvk ?? "",
                    address: fullAddress ?? "",
                  })}{" "}
                  <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>{" "}
                  {t("s1.defGetFillyPost", { phone: COMPANY.phone ?? "" })}
                </td>
              </tr>
              <tr><td style={thtd}>{t("s1.termKlant")}</td><td style={thtd}>{t("s1.defKlant")}</td></tr>
              <tr><td style={thtd}>{t("s1.termGebruiker")}</td><td style={thtd}>{t("s1.defGebruiker")}</td></tr>
              <tr><td style={thtd}>{t("s1.termPlatform")}</td><td style={thtd}>{t("s1.defPlatform")}</td></tr>
              <tr><td style={thtd}>{t("s1.termFilly")}</td><td style={thtd}>{t("s1.defFilly")}</td></tr>
              <tr><td style={thtd}>{t("s1.termAccount")}</td><td style={thtd}>{t("s1.defAccount")}</td></tr>
              <tr><td style={thtd}>{t("s1.termAbonnement")}</td><td style={thtd}>{t("s1.defAbonnement")}</td></tr>
              <tr><td style={thtd}>{t("s1.termGastgegevens")}</td><td style={thtd}>{t("s1.defGastgegevens")}</td></tr>
              <tr><td style={thtd}>{t("s1.termExternePlatformen")}</td><td style={thtd}>{t("s1.defExternePlatformen")}</td></tr>
              <tr><td style={thtd}>{t("s1.termOAuth")}</td><td style={thtd}>{t("s1.defOAuth")}</td></tr>
              <tr><td style={thtd}>{t("s1.termIntegratiegegevens")}</td><td style={thtd}>{t("s1.defIntegratiegegevens")}</td></tr>
              <tr><td style={thtd}>{t("s1.termPlatformvoorwaarden")}</td><td style={thtd}>{t("s1.defPlatformvoorwaarden")}</td></tr>
              <tr><td style={thtd}>{t("s1.termVerwerkersovereenkomst")}</td><td style={thtd}>{t("s1.defVerwerkersovereenkomst")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* 2 */}
        <div id="toepasselijkheid" className="legal-section">
          <h2>{t("s2.heading")}</h2>
          <p>{t("s2.p1")}</p>
          <p>{t("s2.p2")}</p>
          <p>{t("s2.p3")}</p>
          <p>{t("s2.p4")}</p>
        </div>

        {/* 3 */}
        <div id="totstandkoming" className="legal-section">
          <h2>{t("s3.heading")}</h2>
          <p>{t("s3.p1")}</p>
          <p>{t("s3.p2")}</p>
          <p>{t("s3.p3")}</p>
          <p>{t("s3.p4")}</p>
        </div>

        {/* 4 */}
        <div id="dienst" className="legal-section">
          <h2>{t("s4.heading")}</h2>
          <p>{t("s4.p1")}</p>
          <ul>
            <li>{t("s4.li1")}</li>
            <li>{t("s4.li2")}</li>
            <li>{t("s4.li3")}</li>
            <li>{t("s4.li4")}</li>
            <li>{t("s4.li5")}</li>
            <li>{t("s4.li6")}</li>
          </ul>

          <h3>{t("s4.availabilityHeading")}</h3>
          <p>{t("s4.availabilityP1")}</p>

          <h3>{t("s4.aiHeading")}</h3>
          <p>{t("s4.aiP1")}</p>
          <p>{t("s4.aiP2")}</p>
          <p>{t("s4.aiP3")}</p>
        </div>

        {/* 5 */}
        <div id="account" className="legal-section">
          <h2>{t("s5.heading")}</h2>
          <p>{t("s5.p1")}</p>
          <p>{t("s5.p2")}</p>
          <ul>
            <li>{t("s5.li1")}</li>
            <li>{t("s5.li2")}</li>
            <li>{t("s5.li3")}</li>
            <li>{t("s5.li4")}</li>
            <li>{t("s5.li5")}</li>
            <li>{t("s5.li6")}</li>
          </ul>
          <p>{t("s5.p3")}</p>
          <p>{t("s5.p4")}</p>
        </div>

        {/* 6 */}
        <div id="platformen" className="legal-section">
          <h2>{t("s6.heading")}</h2>

          <h3>{t("s6.h1")}</h3>
          <p>{t("s6.p1")}</p>

          <h3>{t("s6.h2")}</h3>
          <p>{t("s6.p2")}</p>

          <h3>{t("s6.h3")}</h3>
          <p>{t("s6.p3")}</p>

          <h3>{t("s6.h4")}</h3>
          <p>{t("s6.p4")}</p>

          <h3>{t("s6.h5")}</h3>
          <p>{t("s6.p5")}</p>

          <h3>{t("s6.h6")}</h3>
          <p>{t("s6.p6")}</p>

          <h3>{t("s6.h7")}</h3>
          <p>{t("s6.p7")}</p>

          <h3>{t("s6.h8")}</h3>
          <p>{t("s6.p8")}</p>
        </div>

        {/* 7 */}
        <div id="google" className="legal-section">
          <h2>{t("s7.heading")}</h2>
          <p>{t("s7.p1")}</p>
          <p>{t("s7.p2")}</p>
          <p>{t("s7.p3")}</p>
          <p>{t("s7.p4")}</p>
          <p>{t("s7.p5")}</p>
        </div>

        {/* 8 */}
        <div id="meta" className="legal-section">
          <h2>{t("s8.heading")}</h2>
          <p>{t("s8.p1")}</p>
          <p>{t("s8.p2")}</p>
          <p>{t("s8.p3")}</p>
          <p>{t("s8.p4")}</p>
        </div>

        {/* 9 */}
        <div id="betaling" className="legal-section">
          <h2>{t("s9.heading")}</h2>
          <p>
            {t("s9.pricesPre")}{" "}
            <a href="/pricing">get-filly.com/pricing</a>.{" "}
            {t("s9.pricesPost")}
          </p>

          <h3>{t("s9.h1")}</h3>
          <p>{t("s9.p1")}</p>
          <p>{t("s9.p2")}</p>

          <h3>{t("s9.h2")}</h3>
          <p>{t("s9.p3")}</p>

          <h3>{t("s9.h3")}</h3>
          <p>{t("s9.p4")}</p>

          <h3>{t("s9.h4")}</h3>
          <p>{t("s9.p5")}</p>
        </div>

        {/* 10 */}
        <div id="duur" className="legal-section">
          <h2>{t("s10.heading")}</h2>
          <p>{t("s10.p1")}</p>

          <h3>{t("s10.h1")}</h3>
          <p>{t("s10.p2")}</p>

          <h3>{t("s10.h2")}</h3>
          <p>
            {t("s10.p3Pre")}{" "}
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.{" "}
            {t("s10.p3Post")}
          </p>
        </div>

        {/* 11 */}
        <div id="data" className="legal-section">
          <h2>{t("s11.heading")}</h2>
          <p>{t("s11.p1")}</p>
          <p>{t("s11.p2")}</p>

          <h3>{t("s11.h1")}</h3>
          <p>{t("s11.p3")}</p>
        </div>

        {/* 12 */}
        <div id="ip" className="legal-section">
          <h2>{t("s12.heading")}</h2>
          <p>{t("s12.p1")}</p>

          <h3>{t("s12.h1")}</h3>
          <p>{t("s12.p2")}</p>
        </div>

        {/* 13 */}
        <div id="rangorde" className="legal-section">
          <h2>{t("s13.heading")}</h2>
          <p>{t("s13.p1")}</p>
          <ol>
            <li>{t("s13.li1")}</li>
            <li>{t("s13.li2")}</li>
            <li>{t("s13.li3")}</li>
            <li>{t("s13.li4")}</li>
            <li>{t("s13.li5")}</li>
          </ol>
          <p>{t("s13.p2")}</p>
        </div>

        {/* 14 */}
        <div id="aansprakelijkheid" className="legal-section">
          <h2>{t("s14.heading")}</h2>
          <p>{t("s14.p1")}</p>

          <h3>{t("s14.h1")}</h3>
          <p>{t("s14.p2", { cap: COMPANY.liabilityCap ?? "" })}</p>

          <h3>{t("s14.h2")}</h3>
          <p>{t("s14.p3")}</p>

          <h3>{t("s14.h3")}</h3>
          <p>{t("s14.p4")}</p>

          <h3>{t("s14.h4")}</h3>
          <p>{t("s14.p5")}</p>

          <h3>{t("s14.h5")}</h3>
          <p>{t("s14.p6")}</p>
        </div>

        {/* 15 */}
        <div id="geheimhouding" className="legal-section">
          <h2>{t("s15.heading")}</h2>
          <p>{t("s15.p1")}</p>
          <p>{t("s15.p2")}</p>
        </div>

        {/* 16 */}
        <div id="overmacht" className="legal-section">
          <h2>{t("s16.heading")}</h2>
          <p>{t("s16.p1")}</p>
          <p>{t("s16.p2")}</p>
        </div>

        {/* 17 */}
        <div id="wijzigingen" className="legal-section">
          <h2>{t("s17.heading")}</h2>
          <p>{t("s17.p1")}</p>
          <p>{t("s17.p2")}</p>
        </div>

        {/* 18 */}
        <div id="recht" className="legal-section">
          <h2>{t("s18.heading")}</h2>
          <p>{t("s18.p1")}</p>
          <p>{t("s18.p2", { court: COMPANY.court ?? "" })}</p>
        </div>
      </div>
    </section>
  );
}
